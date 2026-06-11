import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { TrabeConnectionStatus, TrabeIncidencia } from '../../shared/types'
import {
  createTrabeDbClient,
  readDatabaseUrlFromEnvFile,
  type TrabeDbClient
} from '../trabe/db-client'

function clampLimit(value: unknown, fallback = 100): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(1, limit), 200)
}

// Why: a pg Pool per IPC call would leak connections; cache one client and
// rebuild only when the resolved DATABASE_URL or deep-link base changes.
let cachedClient: { key: string; client: TrabeDbClient } | null = null

function resolveTrabeClient(store: Store): TrabeDbClient | null {
  const settings = store.getSettings()
  const envFilePath = settings.trabeEnvFilePath?.trim()
  if (!envFilePath) {
    return null
  }
  const databaseUrl = readDatabaseUrlFromEnvFile(envFilePath)
  if (!databaseUrl) {
    return null
  }
  const deepLinkBase = settings.trabeDeepLinkBase?.trim() || undefined
  const key = `${databaseUrl}::${deepLinkBase ?? ''}`
  if (cachedClient?.key !== key) {
    void cachedClient?.client.close().catch(() => {})
    cachedClient = { key, client: createTrabeDbClient({ databaseUrl, deepLinkBase }) }
  }
  return cachedClient.client
}

export function registerTrabeHandlers(store: Store): void {
  ipcMain.handle('trabe:status', async (): Promise<TrabeConnectionStatus> => {
    const client = resolveTrabeClient(store)
    // Why: missing env file / DATABASE_URL is "not configured", not an error —
    // the Tasks surface hides the provider instead of surfacing a failure.
    if (!client) {
      return { connected: false }
    }
    const result = await client.testConnection()
    return result.ok ? { connected: true } : { connected: false, error: result.error }
  })

  ipcMain.handle(
    'trabe:listIssues',
    async (_event, args?: { limit?: number }): Promise<TrabeIncidencia[]> => {
      const client = resolveTrabeClient(store)
      if (!client) {
        return []
      }
      return client.listIncidencias({ limit: clampLimit(args?.limit) })
    }
  )

  ipcMain.handle(
    'trabe:getIssue',
    async (_event, args: { numero: number }): Promise<TrabeIncidencia | null> => {
      const client = resolveTrabeClient(store)
      if (!client || typeof args?.numero !== 'number' || !Number.isFinite(args.numero)) {
        return null
      }
      return client.getIncidencia(args.numero)
    }
  )
}
