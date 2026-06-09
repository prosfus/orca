// Pull coordination: which task an agent should pick up next, and whether a task can be
// claimed. Distinct from orchestration's push model — agents select, they are not dispatched.

import { findNodeById, listTasks } from './canvas-document'
import { groupContaining, isTaskReady } from './canvas-graph'
import type { Canvas } from './json-canvas-types'
import type { CanvasPriority, CanvasTask } from './canvas-task'

// A claim with no liveness signal available (file-only CLI) is considered active for this
// long; after it, another agent may steal it. Tunable; see ADR open items.
export const DEFAULT_STALE_CLAIM_MS = 30 * 60 * 1000

const PRIORITY_RANK: Record<CanvasPriority, number> = { high: 0, normal: 1, low: 2 }

function priorityRank(task: CanvasTask): number {
  return PRIORITY_RANK[task.priority ?? 'normal']
}

// An owned task counts as actively claimed only while its claim is fresh.
export function hasActiveClaim(
  task: CanvasTask,
  now: number,
  staleMs = DEFAULT_STALE_CLAIM_MS
): boolean {
  if (!task.owner || !task.claimedAt) {
    return false
  }
  const claimedAt = Date.parse(task.claimedAt)
  return Number.isFinite(claimedAt) && now - claimedAt < staleMs
}

export function taskInPhase(canvas: Canvas, taskId: string, phaseLabel: string): boolean {
  const node = findNodeById(canvas, taskId)
  return node ? groupContaining(canvas, node)?.label === phaseLabel : false
}

export type NextTaskFilter = { phase?: string }

// The next claimable task: ready + todo + not actively claimed, ordered by priority then
// file order (Array.sort is stable, so equal priorities keep their canvas order).
export function selectNextTask(
  canvas: Canvas,
  filter: NextTaskFilter,
  now: number
): CanvasTask | undefined {
  const candidates = listTasks(canvas).filter(
    (task) => task.status === 'todo' && !hasActiveClaim(task, now) && isTaskReady(canvas, task.id)
  )
  const scoped = filter.phase
    ? candidates.filter((task) => taskInPhase(canvas, task.id, filter.phase as string))
    : candidates
  return [...scoped].sort((a, b) => priorityRank(a) - priorityRank(b)).at(0)
}
