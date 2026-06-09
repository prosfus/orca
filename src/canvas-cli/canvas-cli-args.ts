// Minimal argv parser for the standalone canvas CLI. Kept self-contained (no import of the
// interactive `orca` CLI parser) so the bundle stays electron-free. Same grammar:
// positionals, `--flag value`, `--flag=value`, and bare `--flag` booleans.

export type ParsedCliArgs = { positionals: string[]; flags: Map<string, string | boolean> }

export function parseCanvasArgs(argv: string[]): ParsedCliArgs {
  const positionals: string[] = []
  const flags = new Map<string, string | boolean>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const assignment = token.slice(2)
    const equalsIndex = assignment.indexOf('=')
    if (equalsIndex !== -1) {
      flags.set(assignment.slice(0, equalsIndex), assignment.slice(equalsIndex + 1))
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags.set(assignment, true)
      continue
    }
    flags.set(assignment, next)
    i += 1
  }
  return { positionals, flags }
}

export function flagString(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name)
  return typeof value === 'string' ? value : undefined
}

export function flagBool(flags: Map<string, string | boolean>, name: string): boolean {
  return flags.get(name) === true || flags.get(name) === 'true'
}
