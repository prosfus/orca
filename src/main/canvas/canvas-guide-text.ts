// The canonical agent-facing Canvas guide. This is the single source of truth for
// the block Orca injects into each agent's global memory file (CLAUDE.md /
// AGENTS.md / GEMINI.md). It is agent-agnostic and self-conditional on
// ORCA_CANVAS_PATH because those files load in ALL of the agent's projects, not
// just Orca workspaces. It also makes explicit that the Canvas is used ONLY when
// the human asks - its mere presence is not a cue to start working it.
// The markers that wrap this body live in canvas-guide-memory-block.ts.

export function canvasGuideBody(): string {
  return [
    '## Orca Canvas (shared task plan)',
    '',
    'If the `ORCA_CANVAS_PATH` environment variable is set, this workspace has an Orca',
    'Canvas: a shared task plan managed through the `orca-canvas` CLI. If that variable',
    'is NOT set, ignore this section - there is no Canvas here.',
    '',
    'IMPORTANT - use the Canvas ONLY when the human explicitly asks you to (e.g. "work the',
    'plan", "take the next Canvas task", "add this to the Canvas"). Its mere presence is',
    'NOT a request to act: do not run `next`/`claim`, change task status, or work through',
    'it on your own initiative. By default, ignore it.',
    '',
    'When the human asks you to work the Canvas:',
    '1. `orca-canvas next` - show the next ready, unclaimed task.',
    '2. `orca-canvas claim <id>` - claim it before you start (your pane becomes its owner).',
    '3. Do the work, then `orca-canvas set-status <id> done`.',
    '4. If stuck: `orca-canvas set-status <id> blocked` then `orca-canvas release <id>`.',
    '5. To inspect the plan: `orca-canvas list` (add `--ready`, `--mine`, or `--phase P`).',
    '',
    'A claim older than ~30 min is stale; reclaim with `orca-canvas claim <id> --steal`.',
    'Run `orca-canvas help` for the full command list (add-task, set, link, add-phase, show, ...).'
  ].join('\n')
}
