import { spawn, type ChildProcess } from 'node:child_process'
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

type AgentSpec = { cmd: string; args: string[]; streamJson: boolean }

function agentSpec(agent: TuiAgent, bin: string | undefined): AgentSpec | null {
  if (agent === 'claude') {
    // stream-json (which requires --verbose) emits one NDJSON event per step so
    // the UI shows live progress; plain `-p` stays silent until the very end.
    return {
      cmd: bin ?? 'claude',
      args: ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'],
      streamJson: true
    }
  }
  if (agent === 'codex') {
    return {
      cmd: bin ?? 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'],
      streamJson: false
    }
  }
  return null
}

const MAX_STREAM_CHARS = 24_000

// Track running children by diagnosticoId so the UI can cancel an in-flight run.
const running = new Map<string, ChildProcess>()

export function cancelHeadlessDiagnostic(diagnosticoId: string): void {
  running.get(diagnosticoId)?.kill()
}

type ClaudeContentPart = {
  type?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}
type ClaudeStreamEvent = { type?: string; message?: { content?: ClaudeContentPart[] } }

function truncate(value: unknown): string {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}

function toolSummary(name: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!input) {
    return ''
  }
  if (name === 'Bash') {
    return `\`${truncate(input.command)}\``
  }
  if (name === 'Read') {
    return `\`${truncate(input.file_path)}\``
  }
  if (name === 'Grep') {
    return `\`${truncate(input.pattern)}\`${input.path ? ` en ${truncate(input.path)}` : ''}`
  }
  if (name === 'Glob') {
    return `\`${truncate(input.pattern)}\``
  }
  return ''
}

// Turn one claude stream-json event into a short, human-readable progress fragment.
function formatClaudeEvent(event: ClaudeStreamEvent): string {
  if (event.type !== 'assistant' || !event.message?.content) {
    return ''
  }
  let out = ''
  for (const part of event.message.content) {
    if (part.type === 'text' && part.text?.trim()) {
      out += `\n${part.text.trim()}\n`
    } else if (part.type === 'tool_use') {
      out += `\n- 🔧 **${part.name ?? 'tool'}** ${toolSummary(part.name, part.input)}`
    }
  }
  return out
}

/**
 * Run a diagnostic agent headlessly in the worktree: it reads the prompt from
 * stdin, investigates (read-only), writes DIAGNOSTICO.md, and exits — a reliable
 * completion signal (unlike typing into an interactive PTY). Streams parsed
 * progress into the Diagnostico so the UI shows it live, then harvests the
 * report on exit. Resolves when the agent ends.
 */
export function runHeadlessDiagnostic(
  store: Store,
  notifyChanged: () => void,
  args: RunHeadlessDiagnosticArgs
): Promise<void> {
  const { diagnosticoId, agentCli, prompt, worktreePath, envFilePath } = args
  const databaseUrl = readDatabaseUrlFromEnvFile(envFilePath)
  const spec = agentSpec(agentCli, store.getSettings().agentCmdOverrides?.[agentCli])
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
    let lineBuffer = ''
    let lastFlush = 0
    const flush = (force: boolean): void => {
      const now = Date.now()
      if (!force && now - lastFlush < 800) {
        return
      }
      lastFlush = now
      store.updateDiagnostico(diagnosticoId, { markdown: output.slice(-MAX_STREAM_CHARS) })
      notifyChanged()
    }
    const finish = (patch: Parameters<Store['updateDiagnostico']>[1]): void => {
      running.delete(diagnosticoId)
      store.updateDiagnostico(diagnosticoId, { finishedAt: Date.now(), ...patch })
      notifyChanged()
      resolve()
    }
    const ingest = (chunk: string): void => {
      if (!spec.streamJson) {
        output += chunk
        flush(false)
        return
      }
      lineBuffer += chunk
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        try {
          output += formatClaudeEvent(JSON.parse(trimmed) as ClaudeStreamEvent)
        } catch {
          // Non-JSON line (e.g. a stray warning) — keep it visible rather than drop it.
          output += `\n${trimmed}`
        }
      }
      flush(false)
    }

    let child: ChildProcess
    try {
      child = spawn(spec.cmd, spec.args, {
        cwd: worktreePath,
        env: { ...process.env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
        // Why: on Windows `claude`/`codex` are .cmd shims that only resolve via a shell.
        shell: true,
        windowsHide: true
      })
    } catch (err) {
      finish({ status: 'failed', error: `No se pudo lanzar ${spec.cmd}: ${String(err)}` })
      return
    }
    running.set(diagnosticoId, child)

    child.stdout?.on('data', (chunk) => ingest(chunk.toString()))
    child.stderr?.on('data', (chunk) => ingest(chunk.toString()))
    child.on('error', (err) => {
      finish({
        status: 'failed',
        error: `Error al ejecutar el agente: ${err.message}`,
        markdown: output.slice(-MAX_STREAM_CHARS)
      })
    })
    child.on('close', (code, signal) => {
      let report = ''
      try {
        report = readFileSync(path.join(worktreePath, DIAGNOSTICO_FILENAME), 'utf8')
      } catch {
        report = ''
      }
      if (report.trim().length > 0) {
        finish({ status: 'ready', markdown: report, error: null })
      } else if (signal) {
        finish({
          status: 'failed',
          error: 'Diagnóstico cancelado.',
          markdown: output.slice(-MAX_STREAM_CHARS)
        })
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
      // If stdin is unavailable the agent exits and is marked failed by 'close'.
    }
  })
}
