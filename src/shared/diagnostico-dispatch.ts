import type { TrabeIncidencia, TuiAgent } from './types'

// IPC contract for the renderer-driven diagnostic launch pipeline
// (docs/incidencia-diagnostics.md §5). The queue/activeCount live in main; the
// worktree + agent + harvest pipeline lives in the renderer hook.

/** main → renderer: a new incidencia needs a diagnostic agent (queue gated by N). */
export const DIAGNOSTICO_DISPATCH_REQUESTED = 'diagnosticos:dispatchRequested'
/** renderer → main: the pipeline settled (success or failure); free a queue slot. */
export const DIAGNOSTICO_DISPATCH_SETTLED = 'diagnosticos:dispatchSettled'
/** renderer → main: the dispatch hook mounted and can receive requests. */
export const DIAGNOSTICO_RENDERER_READY = 'diagnosticos:rendererReady'

/** Everything the renderer pipeline needs to launch one diagnostic run. */
export type DiagnosticoDispatchRequest = {
  diagnosticoId: string
  incidencia: TrabeIncidencia
  agentCli: TuiAgent
  /** Prompt built in main (needs the incidencia's descripción + the read-only
   *  rules); the renderer must not rebuild it. */
  prompt: string
  /** Trabe repo path the ephemeral diagnostic worktree is created from. */
  repoPath: string
  baseBranch?: string
  /** .env (with DATABASE_URL) injected read-only into the worktree. */
  envFilePath: string
}

export type DiagnosticoDispatchSettled = { diagnosticoId: string }
