// Derived relationships read off the canvas: dependencies (edges), readiness (computed,
// never stored), and phase membership (geometric containment — JSON Canvas has no
// parent/child field, so a task is in the phase whose group rectangle encloses its centre).

import type { Canvas, CanvasGroupNode, CanvasNode } from './json-canvas-types'
import { listGroupNodes, taskStatusById } from './canvas-document'

export function prerequisiteIdsOf(canvas: Canvas, taskId: string): string[] {
  return canvas.edges.filter((edge) => edge.toNode === taskId).map((edge) => edge.fromNode)
}

export function dependentIdsOf(canvas: Canvas, taskId: string): string[] {
  return canvas.edges.filter((edge) => edge.fromNode === taskId).map((edge) => edge.toNode)
}

// Ready ⇔ every prerequisite task is `done`. Independent of the task's own status.
export function isTaskReady(canvas: Canvas, taskId: string): boolean {
  const statusById = taskStatusById(canvas)
  return prerequisiteIdsOf(canvas, taskId).every((id) => statusById.get(id) === 'done')
}

function centreOf(node: CanvasNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function rectContains(group: CanvasGroupNode, point: { x: number; y: number }): boolean {
  return (
    point.x >= group.x &&
    point.x <= group.x + group.width &&
    point.y >= group.y &&
    point.y <= group.y + group.height
  )
}

// The phase group whose rectangle encloses the node's centre, if any.
export function groupContaining(canvas: Canvas, node: CanvasNode): CanvasGroupNode | undefined {
  const centre = centreOf(node)
  return listGroupNodes(canvas).find((group) => rectContains(group, centre))
}

export function groupByLabel(canvas: Canvas, label: string): CanvasGroupNode | undefined {
  return listGroupNodes(canvas).find((group) => group.label === label)
}
