// Read-only Postgres client for Trabe (the LiBuilding ERP). Orca never writes
// to Trabe's DB — only parameterized SELECTs (docs/incidencia-diagnostics.md).
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import type { TrabeIncidencia } from '../../shared/types'

export type TrabeDbClientOptions = { databaseUrl: string; deepLinkBase?: string }

/** Fila de detección: TrabeIncidencia + el createdAt en ms para avanzar el cursor del watcher. */
export type TrabeIncidenciaDetectionRow = TrabeIncidencia & { createdAtMs: number }

export type TrabeDbClient = {
  /** Detección: incidencias 'abierta' no borradas con createdAt > sinceCreatedAt (ms epoch). */
  listNewIncidencias(sinceCreatedAt: number): Promise<TrabeIncidenciaDetectionRow[]>
  /** Listado para la superficie de Tasks (lectura). */
  listIncidencias(opts?: { limit?: number }): Promise<TrabeIncidencia[]>
  getIncidencia(numero: number): Promise<TrabeIncidencia | null>
  testConnection(): Promise<{ ok: boolean; error?: string }>
  close(): Promise<void>
}

type IncidenciaRow = {
  id: string
  numero: number
  asunto: string
  status: string
  priority: string
  category: string | null
  proyectoNombre: string | null
  clienteNombre: string | null
  moduloAfectado: string | null
  errorSignature: string | null
  createdAt: Date
  updatedAt: Date
}

const INCIDENCIA_COLUMNS = `id, numero, asunto, status, priority, category, "proyectoNombre",
       "clienteNombre", "moduloAfectado", "errorSignature", "createdAt", "updatedAt"`

export function createTrabeDbClient(options: TrabeDbClientOptions): TrabeDbClient {
  const pool = new Pool({ connectionString: options.databaseUrl })

  const toIncidencia = (row: IncidenciaRow): TrabeIncidencia => ({
    // Dedupe downstream must key on `id`: `numero` is only unique per organización.
    id: row.id,
    numero: row.numero,
    title: row.asunto,
    state: row.status,
    priority: row.priority,
    category: row.category ?? null,
    labels: row.category ? [row.category] : [],
    proyectoNombre: row.proyectoNombre ?? null,
    empresaNombre: row.clienteNombre ?? null,
    updatedAt: new Date(row.updatedAt).toISOString(),
    url: options.deepLinkBase
      ? `${options.deepLinkBase.replace(/\/$/, '')}/incidencias/${row.numero}`
      : ''
  })

  return {
    async listNewIncidencias(sinceCreatedAt) {
      // The watcher's cursor advances on createdAt, so detection must order
      // ascending and return createdAtMs alongside each row.
      const res = await pool.query<IncidenciaRow>(
        `SELECT ${INCIDENCIA_COLUMNS}
         FROM "Incidencia"
         WHERE "status" = 'abierta'
           AND "deletedAt" IS NULL
           AND "createdAt" > $1
         ORDER BY "createdAt" ASC`,
        [new Date(sinceCreatedAt)]
      )
      return res.rows.map((row) => ({
        ...toIncidencia(row),
        createdAtMs: new Date(row.createdAt).getTime()
      }))
    },

    async listIncidencias(opts) {
      const res = await pool.query<IncidenciaRow>(
        `SELECT ${INCIDENCIA_COLUMNS}
         FROM "Incidencia"
         WHERE "status" = 'abierta'
           AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC
         LIMIT $1`,
        [opts?.limit ?? 100]
      )
      return res.rows.map(toIncidencia)
    },

    async getIncidencia(numero) {
      const res = await pool.query<IncidenciaRow>(
        `SELECT ${INCIDENCIA_COLUMNS}
         FROM "Incidencia"
         WHERE numero = $1
           AND "deletedAt" IS NULL
         LIMIT 1`,
        [numero]
      )
      const row = res.rows[0]
      return row ? toIncidencia(row) : null
    },

    async testConnection() {
      try {
        await pool.query('SELECT 1')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    async close() {
      await pool.end()
    }
  }
}

/** Parsea DATABASE_URL de un fichero .env (líneas KEY=VALUE; admite comillas; ignora # comentarios).
 *  Devuelve null si no existe el fichero o la clave. Usa fs de node; multiplataforma. */
export function readDatabaseUrlFromEnvFile(envFilePath: string): string | null {
  let content: string
  try {
    content = readFileSync(envFilePath, 'utf8')
  } catch {
    return null
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    if (line.slice(0, eq).trim() !== 'DATABASE_URL') continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value || null
  }
  return null
}
