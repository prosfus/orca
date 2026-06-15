import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Store } from '../persistence'
import type { DiagnosticoEvent, DiagnosticoStats, TuiAgent } from '../../shared/types'
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

const MAX_EVENTS = 400
const MAX_RESULT_PREVIEW = 240

// Track running children by diagnosticoId so the UI can cancel an in-flight run.
const running = new Map<string, ChildProcess>()

export function cancelHeadlessDiagnostic(diagnosticoId: string): void {
  running.get(diagnosticoId)?.kill()
}

type ClaudeContentPart = {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
}
type ClaudeStreamEvent = {
  type?: string
  subtype?: string
  model?: string
  message?: { content?: ClaudeContentPart[] }
  duration_ms?: number
  num_turns?: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
}

function truncate(value: unknown, max: number): string {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// One-line summary of a tool's most relevant input (no markdown — the UI styles it).
function toolSummary(name: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!input) {
    return ''
  }
  if (name === 'Bash') {
    return truncate(input.command, 160)
  }
  if (name === 'Read') {
    return truncate(input.file_path, 160)
  }
  if (name === 'Grep') {
    return truncate(input.pattern, 120) + (input.path ? ` · ${truncate(input.path, 80)}` : '')
  }
  if (name === 'Glob') {
    return truncate(input.pattern, 160)
  }
  return truncate(JSON.stringify(input), 120)
}

// tool_result content is a string or an array of { type:'text', text } parts.
function previewResult(content: unknown): string {
  if (typeof content === 'string') {
    return truncate(content, MAX_RESULT_PREVIEW)
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === 'object' ? (part as ClaudeContentPart).text : ''))
      .filter(Boolean)
      .join(' ')
    return truncate(text, MAX_RESULT_PREVIEW)
  }
  return ''
}

/**
 * Run a diagnostic agent headlessly in the worktree: it reads the prompt from
 * stdin, investigates (read-only), writes DIAGNOSTICO.md, and exits — a reliable
 * completion signal (unlike typing into an interactive PTY). Parses the agent's
 * stream-json into a structured live-progress timeline + run stats, then harvests
 * the report on exit. Resolves when the agent ends.
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
    const events: DiagnosticoEvent[] = []
    const toolEventById = new Map<string, DiagnosticoEvent>()
    let stats: DiagnosticoStats | null = null
    let toolCalls = 0
    let lineBuffer = ''
    let lastFlush = 0

    const pushEvent = (event: DiagnosticoEvent): void => {
      events.push(event)
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS)
      }
    }
    const flush = (force: boolean): void => {
      const now = Date.now()
      if (!force && now - lastFlush < 800) {
        return
      }
      lastFlush = now
      store.updateDiagnostico(diagnosticoId, { events: events.map((e) => ({ ...e })), stats })
      notifyChanged()
    }
    const finish = (patch: Parameters<Store['updateDiagnostico']>[1]): void => {
      running.delete(diagnosticoId)
      store.updateDiagnostico(diagnosticoId, {
        finishedAt: Date.now(),
        events: events.map((e) => ({ ...e })),
        stats,
        ...patch
      })
      notifyChanged()
      resolve()
    }

    const handleClaudeEvent = (event: ClaudeStreamEvent): void => {
      if (event.type === 'system' && event.subtype === 'init' && event.model) {
        stats = { ...stats, model: event.model }
        return
      }
      if (event.type === 'assistant' && event.message?.content) {
        for (const part of event.message.content) {
          if (part.type === 'text' && part.text?.trim()) {
            pushEvent({ kind: 'text', at: Date.now(), text: part.text.trim() })
          } else if (part.type === 'tool_use') {
            toolCalls += 1
            const toolEvent: DiagnosticoEvent = {
              kind: 'tool',
              at: Date.now(),
              tool: part.name ?? 'tool',
              summary: toolSummary(part.name, part.input)
            }
            pushEvent(toolEvent)
            if (part.id) {
              toolEventById.set(part.id, toolEvent)
            }
          }
        }
        return
      }
      if (event.type === 'user' && event.message?.content) {
        for (const part of event.message.content) {
          if (part.type === 'tool_result' && part.tool_use_id) {
            const toolEvent = toolEventById.get(part.tool_use_id)
            if (toolEvent) {
              toolEvent.result = previewResult(part.content)
            }
          }
        }
        return
      }
      if (event.type === 'result') {
        stats = {
          ...stats,
          durationMs: event.duration_ms,
          numTurns: event.num_turns,
          costUsd: event.total_cost_usd,
          inputTokens: event.usage?.input_tokens,
          outputTokens: event.usage?.output_tokens,
          toolCalls
        }
      }
    }

    const ingest = (chunk: string): void => {
      if (!spec.streamJson) {
        for (const line of chunk.split('\n')) {
          if (line.trim()) {
            pushEvent({ kind: 'text', at: Date.now(), text: line.trim() })
          }
        }
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
          handleClaudeEvent(JSON.parse(trimmed) as ClaudeStreamEvent)
        } catch {
          // Non-JSON line (e.g. a stray warning) — surface it as a note.
          pushEvent({ kind: 'note', at: Date.now(), text: trimmed })
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
      finish({ status: 'failed', error: `Error al ejecutar el agente: ${err.message}` })
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
        finish({ status: 'failed', error: 'Diagnóstico cancelado.' })
      } else {
        finish({
          status: 'failed',
          error: `El agente terminó (código ${code ?? 'desconocido'}) sin escribir ${DIAGNOSTICO_FILENAME}.`
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
