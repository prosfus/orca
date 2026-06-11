import { useEffect } from 'react'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'

// Why: main builds DIAGNOSTICO.md's name into the prompt; keep the harvest path
// in sync with src/main/trabe/diagnostic-prompt.ts (DIAGNOSTICO_FILENAME).
const DIAGNOSTICO_FILENAME = 'DIAGNOSTICO.md'

function joinWorktreePath(worktreePath: string, file: string): string {
  return `${worktreePath.replace(/[/\\]$/, '')}/${file}`
}

/**
 * Renderer half of the diagnostic launch pipeline (docs/incidencia-diagnostics.md
 * §5). Listens for main's dispatch requests (queue gated by N), runs one
 * ephemeral worktree + agent per incidencia, harvests the report, and acks so
 * main can free the slot.
 */
export function useDiagnosticoDispatch(): void {
  useEffect(() => {
    const unsubscribe = window.api.diagnosticos.onDispatchRequested(async (request) => {
      const settle = (): void => {
        void window.api.diagnosticos.dispatchSettled(request.diagnosticoId)
      }
      const failDiagnostico = async (error: string, worktreeId?: string): Promise<void> => {
        await window.api.diagnosticos.update(request.diagnosticoId, {
          status: 'failed',
          error,
          finishedAt: Date.now(),
          ...(worktreeId ? { worktreeId } : {})
        })
      }

      const state = useAppStore.getState()
      const repo = state.repos.find((entry) => entry.path === request.repoPath)
      if (!repo) {
        await failDiagnostico('El repo de Trabe no está registrado en Orca.')
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

        // Hide the ephemeral worktree from Workspaces (origin 'incidencia'), both
        // in persisted lineage and optimistically in the live store.
        await window.api.diagnosticos.adoptWorktree(worktree.id)
        useAppStore.setState((s) => {
          const existing = s.worktreeLineageById[worktree.id]
          if (!existing) {
            return {}
          }
          return {
            worktreeLineageById: {
              ...s.worktreeLineageById,
              [worktree.id]: { ...existing, origin: 'incidencia' }
            }
          }
        })

        // Inject the read-only .env (with DATABASE_URL) into the worktree so the
        // agent can reach Trabe's DB; removeWorktree later wipes it with the checkout.
        try {
          const envFile = await window.api.fs.readFile({ filePath: request.envFilePath })
          await window.api.fs.writeFile({
            filePath: joinWorktreePath(worktree.path, '.env'),
            content: envFile.content
          })
        } catch {
          // Best-effort: without the .env the agent simply can't reach the DB.
        }

        const worktreePath = worktree.path
        let finalized = false
        const finalize = async (outcome: { ok: boolean; error?: string }): Promise<void> => {
          if (finalized) {
            return
          }
          finalized = true
          if (outcome.ok) {
            let markdown = ''
            try {
              const report = await window.api.fs.readFile({
                filePath: joinWorktreePath(worktreePath, DIAGNOSTICO_FILENAME)
              })
              markdown = report.content
            } catch {
              markdown = ''
            }
            await (markdown.trim().length > 0
              ? window.api.diagnosticos.update(request.diagnosticoId, {
                  status: 'ready',
                  markdown,
                  finishedAt: Date.now(),
                  error: null
                })
              : failDiagnostico(
                  'El agente terminó sin escribir DIAGNOSTICO.md.',
                  worktreeId ?? undefined
                ))
          } else {
            await failDiagnostico(
              outcome.error ?? 'El agente de diagnóstico falló.',
              worktreeId ?? undefined
            )
          }
          if (worktreeId) {
            await state.removeWorktree(worktreeId, true)
          }
          settle()
        }

        const launch = await launchAgentBackgroundSession({
          agent: request.agentCli,
          worktreeId: worktree.id,
          prompt: request.prompt,
          launchSource: 'unknown',
          title: `Incidencia #${request.incidencia.numero}`,
          onAgentStatus: (payload) => {
            if (payload.state === 'done') {
              void finalize({ ok: true })
            }
          },
          onExit: (_ptyId, code) => {
            // Exit without a prior 'done' still harvests: a clean exit means the
            // agent finished; a non-zero exit is a failure.
            void finalize(
              code === 0
                ? { ok: true }
                : { ok: false, error: `El agente salió con código ${code}.` }
            )
          }
        })
        if (!launch) {
          await finalize({
            ok: false,
            error: 'No se pudo construir el plan de lanzamiento del agente.'
          })
        }
      } catch (error) {
        await failDiagnostico(
          error instanceof Error ? error.message : String(error),
          worktreeId ?? undefined
        )
        if (worktreeId) {
          await state.removeWorktree(worktreeId, true)
        }
        settle()
      }
    })
    void window.api.diagnosticos.rendererReady()
    return unsubscribe
  }, [])
}
