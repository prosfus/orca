#!/usr/bin/env node
// Standalone `orca canvas` CLI. File-only (no network, no Orca connection) so it runs wherever
// the worktree lives, including over SSH. Resolves its file from ORCA_CANVAS_PATH (injected
// into agent panes) or --file; owner identity from ORCA_PANE_KEY or --owner.

import { flagString, parseCanvasArgs } from './canvas-cli-args'
import { runCommand, type CommandContext } from './canvas-cli-commands'

const USAGE = `orca canvas <command> [args] [--flags]

  add-task "<title>" [--phase P] [--after a,b] [--priority p] [--est e] [--ref r] [--desc d]
  set <id> [--title t] [--desc d] [--priority p] [--est e] [--ref r]
  set-status <id> <todo|in-progress|blocked|done>
  set-position <id> <x> <y>                (Orca UI / remote-write only)
  link <prerequisiteId> <dependentId>      unlink <prerequisiteId> <dependentId>
  add-phase "<label>"
  next [--phase P]                         list [--ready] [--mine] [--phase P]
  claim <id> [--steal]                     release <id>      show <id>
  remove-task <id> [--force]

  --file <path>   override ORCA_CANVAS_PATH      --json   machine-readable output
`

function resolveFile(flags: Map<string, string | boolean>): string {
  const file = flagString(flags, 'file') ?? process.env.ORCA_CANVAS_PATH
  if (!file) {
    throw new Error('No canvas file: set ORCA_CANVAS_PATH (agent pane) or pass --file <path>')
  }
  return file
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { positionals, flags } = parseCanvasArgs(argv)
  const json = flags.get('json') === true
  const command = positionals[0]
  if (!command || command === 'help') {
    process.stdout.write(USAGE)
    return
  }
  try {
    const ctx: CommandContext = {
      file: resolveFile(flags),
      positionals: positionals.slice(1),
      flags,
      owner: flagString(flags, 'owner') ?? process.env.ORCA_PANE_KEY,
      now: Date.now()
    }
    const result = await runCommand(command, ctx)
    process.stdout.write(json ? `${JSON.stringify(result.json)}\n` : `${result.human}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (json) {
      process.stderr.write(`${JSON.stringify({ error: message })}\n`)
    } else {
      process.stderr.write(`error: ${message}\n`)
    }
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}
