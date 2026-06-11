import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Store } from '../persistence'
import type { TuiAgent } from '../../shared/types'
import { DIAGNOSTICO_FILENAME } from './diagnostic-prompt'

const PROMPT_FILE = '.orca-diagnostico-prompt.md'
const RUN_SCRIPT_WIN = '.orca-diagnostico-run.ps1'
const RUN_SCRIPT_POSIX = '.orca-diagnostico-run.sh'

export type PrepareDiagnosticRunArgs = {
  agentCli: TuiAgent
  prompt: string
  worktreePath: string
  envFilePath: string
}

export type HarvestDiagnosticArgs = {
  diagnosticoId: string
  worktreePath: string
  exitCode: number
}

// Headless invocation per agent; the prompt is piped via stdin (no argv quoting).
function headlessAgentCommand(agent: TuiAgent, bin: string | undefined): string | null {
  if (agent === 'claude') {
    return `${bin ?? 'claude'} -p --dangerously-skip-permissions`
  }
  if (agent === 'codex') {
    return `${bin ?? 'codex'} exec --dangerously-bypass-approvals-and-sandbox`
  }
  return null
}

/**
 * Write the prompt + a wrapper script into the worktree and return the command
 * to run it in an Orca terminal. The script resolves DATABASE_URL from the .env
 * at runtime (the secret never reaches the renderer or the command line) and
 * pipes the prompt into the headless agent, which writes DIAGNOSTICO.md and exits.
 */
export function prepareDiagnosticRun(
  store: Store,
  args: PrepareDiagnosticRunArgs
): { command: string } | null {
  const agentBin = store.getSettings().agentCmdOverrides?.[args.agentCli]
  const agentCommand = headlessAgentCommand(args.agentCli, agentBin)
  if (!agentCommand) {
    return null
  }
  const promptPath = path.join(args.worktreePath, PROMPT_FILE)
  writeFileSync(promptPath, args.prompt, 'utf8')

  const env = args.envFilePath
  if (process.platform === 'win32') {
    const scriptPath = path.join(args.worktreePath, RUN_SCRIPT_WIN)
    const script = [
      `$line = Select-String -Path '${env}' -Pattern '^\\s*DATABASE_URL\\s*=' | Select-Object -First 1`,
      `if ($line) {`,
      `  $v = ($line.Line -replace '^\\s*DATABASE_URL\\s*=\\s*', '').Trim()`,
      `  if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }`,
      `  elseif ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }`,
      `  $env:DATABASE_URL = $v`,
      `}`,
      `Get-Content -Raw '${promptPath}' | ${agentCommand}`,
      // Why: the PTY runs an interactive shell and types this command; exit so the
      // shell closes when the agent finishes → PTY exit → harvest.
      'exit'
    ].join('\n')
    writeFileSync(scriptPath, script, 'utf8')
    // Why: run in the PTY's own (profile-loaded) shell with `&` so `claude` is on
    // PATH; a nested `powershell -NoProfile` would lose it. Process-scoped Bypass
    // lets the local .ps1 run regardless of the machine's ExecutionPolicy.
    return {
      command: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; & '${scriptPath}'`
    }
  }

  const scriptPath = path.join(args.worktreePath, RUN_SCRIPT_POSIX)
  const script = [
    `export DATABASE_URL="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' '${env}' | head -1 | sed -E 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//')"`,
    `cat '${promptPath}' | ${agentCommand}`,
    'exit'
  ].join('\n')
  writeFileSync(scriptPath, script, 'utf8')
  // Source it in the PTY's own shell so $PATH (and the agent) resolve, and the
  // trailing `exit` closes the shell → PTY exit → harvest.
  return { command: `. '${scriptPath}'` }
}

/** Read the harvested report on agent exit, set the Diagnostico status, and
 *  clean up the transient prompt/script files. */
export function harvestDiagnostic(
  store: Store,
  notifyChanged: () => void,
  args: HarvestDiagnosticArgs
): void {
  let report = ''
  try {
    report = readFileSync(path.join(args.worktreePath, DIAGNOSTICO_FILENAME), 'utf8')
  } catch {
    report = ''
  }
  if (report.trim().length > 0) {
    store.updateDiagnostico(args.diagnosticoId, {
      status: 'ready',
      markdown: report,
      finishedAt: Date.now(),
      error: null
    })
  } else {
    store.updateDiagnostico(args.diagnosticoId, {
      status: 'failed',
      error: `El agente terminó (código ${args.exitCode}) sin escribir ${DIAGNOSTICO_FILENAME}.`,
      finishedAt: Date.now()
    })
  }
  for (const file of [PROMPT_FILE, RUN_SCRIPT_WIN, RUN_SCRIPT_POSIX]) {
    try {
      unlinkSync(path.join(args.worktreePath, file))
    } catch {
      // best-effort cleanup
    }
  }
  notifyChanged()
}
