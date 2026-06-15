import { ipcMain, type WebContents } from 'electron'
import type { Store } from '../persistence'
import type { GlobalSettings, TrabeIncidencia } from '../../shared/types'
import { createTrabeDbClient, readDatabaseUrlFromEnvFile, type TrabeDbClient } from './db-client'
import { buildDiagnosticPrompt } from './diagnostic-prompt'
import {
  DIAGNOSTICO_DISPATCH_REQUESTED,
  DIAGNOSTICO_DISPATCH_SETTLED,
  DIAGNOSTICO_RENDERER_READY,
  type DiagnosticoDispatchRequest,
  type DiagnosticoDispatchSettled
} from '../../shared/diagnostico-dispatch'

const DEFAULT_POLL_MS = 30_000
const DEFAULT_CONCURRENCY = 2

type WatcherConfig = { databaseUrl: string; repoPath: string; envFilePath: string }

// Polls Trabe's DB for new incidencias and feeds a renderer-driven launch
// queue. Mirrors AutomationService's webContents/rendererReady lifecycle.
export class IncidenciaWatcher {
  private readonly store: Store
  private timer: ReturnType<typeof setInterval> | null = null
  private webContents: WebContents | null = null
  private rendererReady = false
  private polling = false
  private activeCount = 0
  private readonly queue: DiagnosticoDispatchRequest[] = []
  // Dedupe within a session: numero is unique only per organización, so key on id.
  private readonly seenIncidenciaIds = new Set<string>()

  constructor(store: Store) {
    this.store = store
    ipcMain.handle(DIAGNOSTICO_RENDERER_READY, (): void => {
      this.setRendererReady()
    })
    ipcMain.handle(
      DIAGNOSTICO_DISPATCH_SETTLED,
      (_event, payload: DiagnosticoDispatchSettled): void => {
        this.handleSettled(payload?.diagnosticoId)
      }
    )
    // Manual on-demand trigger (e.g. the "Diagnosticar última incidencia" button).
    ipcMain.handle(
      'diagnosticos:triggerLatest',
      (): Promise<{ ok: boolean; error?: string }> => this.triggerLatestOpen()
    )
  }

  setWebContents(webContents: WebContents | null): void {
    this.webContents = webContents
    this.rendererReady = false
  }

  setRendererReady(): void {
    this.rendererReady = true
    this.drainQueue()
  }

  start(): void {
    if (this.timer) {
      return
    }
    const interval = this.store.getSettings().diagnosticoPollIntervalMs ?? DEFAULT_POLL_MS
    this.timer = setInterval(() => {
      void this.poll()
    }, interval)
    void this.poll()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private resolveConfig(): WatcherConfig | null {
    const settings = this.store.getSettings()
    const envFilePath = settings.trabeEnvFilePath
    const repoPath = settings.trabeRepoPath
    if (!envFilePath || !repoPath) {
      return null
    }
    const databaseUrl = readDatabaseUrlFromEnvFile(envFilePath)
    if (!databaseUrl) {
      return null
    }
    return { databaseUrl, repoPath, envFilePath }
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      return
    }
    this.polling = true
    const config = this.resolveConfig()
    if (!config) {
      this.polling = false
      return
    }
    const client = createTrabeDbClient({
      databaseUrl: config.databaseUrl,
      deepLinkBase: this.store.getSettings().trabeDeepLinkBase
    })
    try {
      const settings = this.store.getSettings()
      // First activation: baseline the cursor at "now" so we only diagnose
      // incidencias created after enabling, never the whole open backlog.
      if (settings.trabeLastSeenIncidenciaCreatedAt === undefined) {
        this.store.updateSettings({ trabeLastSeenIncidenciaCreatedAt: Date.now() })
        return
      }
      const cursor = settings.trabeLastSeenIncidenciaCreatedAt
      const rows = await client.listNewIncidencias(cursor)
      let maxCreatedAt = cursor
      for (const row of rows) {
        const { createdAtMs, ...incidencia } = row
        maxCreatedAt = Math.max(maxCreatedAt, createdAtMs)
        if (this.seenIncidenciaIds.has(incidencia.id)) {
          continue
        }
        this.seenIncidenciaIds.add(incidencia.id)
        await this.enqueueDiagnostic(incidencia, config, settings, client)
      }
      // Cursor is monotonic on createdAt; advance past everything we just saw so
      // restarts never re-detect the same incidencia.
      if (maxCreatedAt > cursor) {
        this.store.updateSettings({ trabeLastSeenIncidenciaCreatedAt: maxCreatedAt })
      }
      this.drainQueue()
    } catch (err) {
      console.error('[incidencia-watcher] poll failed:', err)
    } finally {
      await client.close()
      this.polling = false
    }
  }

  // Build the prompt (needs the incidencia's descripción, not on TrabeIncidencia)
  // and queue a dispatch. Shared by polling and the manual trigger.
  private async enqueueDiagnostic(
    incidencia: TrabeIncidencia,
    config: WatcherConfig,
    settings: GlobalSettings,
    client: TrabeDbClient
  ): Promise<void> {
    const agentCli = settings.diagnosticoAgent ?? 'claude'
    const detail = await client.getIncidenciaDetail(incidencia.numero)
    const prompt = buildDiagnosticPrompt({
      numero: incidencia.numero,
      asunto: detail?.asunto ?? incidencia.title,
      descripcion: detail?.descripcion ?? null,
      moduloAfectado: detail?.moduloAfectado ?? null,
      errorSignature: detail?.errorSignature ?? null,
      proyectoNombre: detail?.proyectoNombre ?? incidencia.proyectoNombre,
      clienteNombre: detail?.clienteNombre ?? incidencia.empresaNombre
    })
    const diagnostico = this.store.createDiagnostico({
      incidenciaNumero: incidencia.numero,
      incidenciaAsunto: incidencia.title,
      agentCli,
      prompt,
      incidencia: {
        empresaNombre: detail?.clienteNombre ?? incidencia.empresaNombre,
        proyectoNombre: detail?.proyectoNombre ?? incidencia.proyectoNombre,
        moduloAfectado: detail?.moduloAfectado ?? null,
        errorSignature: detail?.errorSignature ?? null,
        descripcion: detail?.descripcion ?? null,
        url: incidencia.url
      }
    })
    this.queue.push({
      diagnosticoId: diagnostico.id,
      incidencia,
      agentCli,
      prompt,
      repoPath: config.repoPath,
      baseBranch: settings.trabeBaseBranch,
      envFilePath: config.envFilePath
    })
  }

  // Manually diagnose the most recently created open incidencia (on-demand,
  // bypassing the cursor). Returns a result for UI feedback.
  async triggerLatestOpen(): Promise<{ ok: boolean; error?: string }> {
    const config = this.resolveConfig()
    if (!config) {
      return {
        ok: false,
        error: 'Trabe no está configurado: revisa la ruta del .env y del repo en Ajustes.'
      }
    }
    const settings = this.store.getSettings()
    const client = createTrabeDbClient({
      databaseUrl: config.databaseUrl,
      deepLinkBase: settings.trabeDeepLinkBase
    })
    try {
      const [incidencia] = await client.listIncidencias({ limit: 1 })
      if (!incidencia) {
        return { ok: false, error: 'No hay incidencias abiertas para diagnosticar.' }
      }
      this.seenIncidenciaIds.add(incidencia.id)
      await this.enqueueDiagnostic(incidencia, config, settings, client)
      this.drainQueue()
      return { ok: true }
    } catch (err) {
      console.error('[incidencia-watcher] manual trigger failed:', err)
      return { ok: false, error: String(err) }
    } finally {
      await client.close()
    }
  }

  private drainQueue(): void {
    const webContents = this.webContents
    if (!webContents || webContents.isDestroyed() || !this.rendererReady) {
      return
    }
    const concurrency = this.store.getSettings().diagnosticoConcurrency ?? DEFAULT_CONCURRENCY
    while (this.activeCount < concurrency && this.queue.length > 0) {
      const request = this.queue.shift()
      if (!request) {
        break
      }
      this.activeCount += 1
      webContents.send(DIAGNOSTICO_DISPATCH_REQUESTED, request)
    }
  }

  private handleSettled(diagnosticoId: string | undefined): void {
    if (!diagnosticoId) {
      return
    }
    if (this.activeCount > 0) {
      this.activeCount -= 1
    }
    this.drainQueue()
  }
}
