import { useEffect } from 'react'
import { useAppStore } from '@/store'

// Why: trabeRepoPath (from settings) and repo.path can differ in slash style and
// case on Windows; normalize so the repo lookup matches regardless.
function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Renderer half of the diagnostic launch pipeline (docs/incidencia-diagnostics.md
 * §5). On each dispatch it creates an ephemeral worktree, runs the agent headless
 * in main (which streams output and harvests the report), removes the worktree,
 * and acks so main can free a queue slot.
 */
export function useDiagnosticoDispatch(): void {
  useEffect(() => {
    const unsubscribe = window.api.diagnosticos.onDispatchRequested(async (request) => {
      const state = useAppStore.getState()
      const targetRepoPath = normalizeRepoPath(request.repoPath)
      const repo = state.repos.find((entry) => normalizeRepoPath(entry.path) === targetRepoPath)
      if (!repo) {
        await window.api.diagnosticos.update(request.diagnosticoId, {
          status: 'failed',
          error: 'El repo de Trabe no está registrado en Orca.',
          finishedAt: Date.now()
        })
        void window.api.diagnosticos.dispatchSettled(request.diagnosticoId)
        return
      }

      let worktreeId: string | null = null
      try {
        const { worktree } = await state.createWorktree(
          repo.id,
          `diag-inc-${request.incidencia.numero}`,
          request.baseBranch,
          'skip'
        )
        worktreeId = worktree.id
        await window.api.diagnosticos.update(request.diagnosticoId, { worktreeId: worktree.id })

        // Hide the ephemeral worktree from Workspaces (origin 'incidencia').
        await window.api.diagnosticos.adoptWorktree(worktree.id)

        // Run the agent headless in main: it reads code + DB (read-only), writes
        // DIAGNOSTICO.md, and exits. Main streams output into the Diagnostico and
        // harvests the report, setting status ready/failed before resolving.
        await window.api.diagnosticos.runAgent({
          diagnosticoId: request.diagnosticoId,
          agentCli: request.agentCli,
          prompt: request.prompt,
          worktreePath: worktree.path,
          envFilePath: request.envFilePath
        })
      } catch (error) {
        await window.api.diagnosticos.update(request.diagnosticoId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: Date.now(),
          ...(worktreeId ? { worktreeId } : {})
        })
      } finally {
        if (worktreeId) {
          await state.removeWorktree(worktreeId, true)
        }
        void window.api.diagnosticos.dispatchSettled(request.diagnosticoId)
      }
    })
    void window.api.diagnosticos.rendererReady()
    return unsubscribe
  }, [])
}
