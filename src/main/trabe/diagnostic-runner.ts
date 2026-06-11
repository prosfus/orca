import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Store } from '../persistence'
import type { TuiAgent } from '../../shared/types'
import { readDatabaseUrlFromEnvFile } from './db-client'
import { DIAGNOSTICO_FILENAME } from './diagnostic-prompt'

export type RunHeadlessDiagnosticArgs = {
  diagnosticoId: string
  agentCli: TuiAgent
  prompt: string
  worktreePath: string
  envFilePath: string
}

// Headless invocation per agent. The prompt is fed via stdin (no argv quoting),
// and permission gates are bypassed because the prompt itself enforces read-only.
function headlessSpec(
  agent: TuiAgent,
  bin: string | undefined
): { cmd: string; args: string[] } | null {
  if (agent === 'claude') {
    return { cmd: bin ?? 'claude', args: ['-p', '--dangerously-skip-permissions'] }
  }
  if (agent === 'codex') {
    return {
      cmd: bin ?? 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-']
    }
  }
  return null
}

const MAX_STREAM_CHARS = 20_000

/**
 * Run a diagnostic agent headlessly in the worktree: it reads the prompt from
 * stdin, investigates (read-only), writes DIAGNOSTICO.md, and exits — giving a
 * reliable completion signal. Streams output into the Diagnostico so the UI can
 * show live progress; harvests the report on exit. Resolves when the agent ends.
 */
export function runHeadlessDiagnostic(
  store: Store,
  notifyChanged: () => void,
  args: RunHeadlessDiagnosticArgs
): Promise<void> {
  const { diagnosticoId, agentCli, prompt, worktreePath, envFilePath } = args
  const databaseUrl = readDatabaseUrlFromEnvFile(envFilePath)
  const spec = headlessSpec(agentCli, store.getSettings().agentCmdOverrides?.[agentCli])
  if (!spec) {
    store.updateDiagnostico(diagnosticoId, {
      status: 'failed',
      error: `El agente ${agentCli} no está soportado en modo headless.`,
      finishedAt: Date.now()
    })
    notifyChanged()
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    let output = ''
    let lastFlush = 0
    const flush = (force: boolean): void => {
      const now = Date.now()
      if (!force && now - lastFlush < 1000) {
        return
      }
      lastFlush = now
      store.updateDiagnostico(diagnosticoId, { markdown: output.slice(-MAX_STREAM_CHARS) })
      notifyChanged()
    }
    const finish = (patch: Parameters<Store['updateDiagnostico']>[1]): void => {
      store.updateDiagnostico(diagnosticoId, { finishedAt: Date.now(), ...patch })
      notifyChanged()
      resolve()
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(spec.cmd, spec.args, {
        cwd: worktreePath,
        env: { ...process.env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
        shell: true,
        windowsHide: true
      })
    } catch (err) {
      finish({ status: 'failed', error: `No se pudo lanzar ${spec.cmd}: ${String(err)}` })
      return
    }

    child.stdout?.on('data', (chunk) => {
      output += chunk.toString()
      flush(false)
    })
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString()
      flush(false)
    })
    child.on('error', (err) => {
      finish({
        status: 'failed',
        error: `Error al ejecutar el agente: ${err.message}`,
        markdown: output.slice(-MAX_STREAM_CHARS)
      })
    })
    child.on('close', (code) => {
      let report = ''
      try {
        report = readFileSync(path.join(worktreePath, DIAGNOSTICO_FILENAME), 'utf8')
      } catch {
        report = ''
      }
      if (report.trim().length > 0) {
        finish({ status: 'ready', markdown: report, error: null })
      } else {
        finish({
          status: 'failed',
          error: `El agente terminó (código ${code ?? 'desconocido'}) sin escribir ${DIAGNOSTICO_FILENAME}.`,
          markdown: output.slice(-MAX_STREAM_CHARS)
        })
      }
    })

    try {
      child.stdin?.write(prompt)
      child.stdin?.end()
    } catch {
      // If stdin is unavailable the agent will exit and be marked failed above.
    }
  })
}
