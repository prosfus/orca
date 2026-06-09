// Output shaping for the canvas CLI: every command returns both a human line and a JSON
// payload, so `--json` (used by agents) and the default human view share one code path.

import { isCanvasPriority, type CanvasPriority, type CanvasTask } from '../shared/canvas'

export type CommandResult = { human: string; json: unknown }

export function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : undefined
}

export function parsePriority(value: string | undefined): CanvasPriority | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!isCanvasPriority(value)) {
    throw new Error(`Invalid priority "${value}" (expected low | normal | high)`)
  }
  return value
}

export function statusBadge(task: CanvasTask): string {
  return task.owner ? `${task.status} @${task.owner}` : task.status
}

export function formatTaskOneLine(task: CanvasTask, ready: boolean): string {
  const tags = [
    task.priority && task.priority !== 'normal' ? task.priority : null,
    ready && task.status === 'todo' ? 'ready' : null
  ].filter((tag): tag is string => tag !== null)
  const suffix = tags.length > 0 ? ` (${tags.join(' ')})` : ''
  return `${task.id}  [${statusBadge(task)}]${suffix}  ${task.title}`
}
