import { useEffect } from 'react'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'

// Why: trabeRepoPath (from settings) and repo.path can differ in slash style and
// case on Windows; normalize so the repo lookup matches regardless.
function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Renderer half of the diagnostic launch pipeline (docs/incidencia-diagnostics.md
 * §5). Creates an ephemeral (Workspaces-hidden) worktree and runs the headless
 * agent in a real Orca terminal there — reachable via "Ver agente" — then
 * harvests the report on exit. The worktree is kept for inspection and removed
 * when the diagnostic is discarded.
 */
export function useDiagnosticoDispatch(): void {
  useEffect(() => {
    const unsubscribe = window.api.diagnosticos.onDispatchRequested(async (request) => {
      const settle = (): void => {
        void window.api.diagnosticos.dispatchSettled(request.diagnosticoId)
      }
      const fail = (error: string, worktreeId?: string): void => {
        void window.api.diagnosticos.update(request.diagnosticoId, {
          status: 'failed',
          error,
          finishedAt: Date.now(),
          ...(worktreeId ? { worktreeId } : {})
        })
      }

      const state = useAppStore.getState()
      const target = normalizeRepoPath(request.repoPath)
      const repo = state.repos.find((entry) => normalizeRepoPath(entry.path) === target)
      if (!repo) {
        fail('El repo de Trabe no está registrado en Orca.')
        settle()
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
        await window.api.diagnosticos.adoptWorktree(worktree.id)

        const prepared = await window.api.diagnosticos.prepareAgentRun({
          agentCli: request.agentCli,
          prompt: request.prompt,
          worktreePath: worktree.path,
          envFilePath: request.envFilePath
        })
        if (!prepared) {
          fail('No se pudo preparar el agente de diagnóstico.', worktree.id)
          settle()
          return
        }

        let settled = false
        const launched = await launchAgentBackgroundSession({
          agent: request.agentCli,
          worktreeId: worktree.id,
          commandOverride: prepared.command,
          launchSource: 'unknown',
          title: `Incidencia #${request.incidencia.numero}`,
          onExit: (_ptyId, code) => {
            if (settled) {
              return
            }
            settled = true
            void window.api.diagnosticos
              .harvest({
                diagnosticoId: request.diagnosticoId,
                worktreePath: worktree.path,
                exitCode: code
              })
              .finally(settle)
          }
        })
        if (!launched) {
          fail('No se pudo lanzar el agente de diagnóstico.', worktree.id)
          settle()
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), worktreeId ?? undefined)
        settle()
      }
    })
    void window.api.diagnosticos.rendererReady()
    return unsubscribe
  }, [])
}
