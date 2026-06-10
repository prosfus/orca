// Manual "tidy" auto-arrange (no dependency lib): lay tasks out in dependency-depth columns —
// a task sits one column right of its deepest prerequisite. Pure + unit-tested; the panel turns
// the result into setPosition mutations behind a confirm (it overwrites manual positions).

import type { CanvasPlanView } from '../../../../shared/canvas/canvas-plan-view'

const COLUMN_WIDTH = 340
const ROW_HEIGHT = 200

export function computeTidyLayout(plan: CanvasPlanView): { id: string; x: number; y: number }[] {
  const prereqsById = new Map<string, string[]>()
  for (const task of plan.tasks) {
    prereqsById.set(
      task.id,
      plan.edges.filter((edge) => edge.toNode === task.id).map((edge) => edge.fromNode)
    )
  }

  const depthById = new Map<string, number>()
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthById.get(id)
    if (cached !== undefined) {
      return cached
    }
    if (stack.has(id)) {
      return 0 // cycle guard (a DAG should not hit this)
    }
    stack.add(id)
    const prereqs = prereqsById.get(id) ?? []
    const depth = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map((p) => depthOf(p, stack)))
    stack.delete(id)
    depthById.set(id, depth)
    return depth
  }

  const rowByDepth = new Map<number, number>()
  return plan.tasks.map((task) => {
    const depth = depthOf(task.id, new Set())
    const row = rowByDepth.get(depth) ?? 0
    rowByDepth.set(depth, row + 1)
    return { id: task.id, x: depth * COLUMN_WIDTH, y: row * ROW_HEIGHT }
  })
}
