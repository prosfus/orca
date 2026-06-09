// Pure delta operations on the canvas STRUCTURE: dependency edges and phase groups.
// Each returns a new Canvas; none performs I/O. Task lifecycle lives in canvas-task-mutations.

import { findNodeById, listGroupNodes } from './canvas-document'
import { slugify, uniqueNodeId } from './canvas-id'
import { placePhaseGroup } from './canvas-layout'
import type { Canvas, CanvasEdge, CanvasGroupNode } from './json-canvas-types'

function dependencyEdgeId(fromId: string, toId: string): string {
  return `dep-${fromId}--${toId}`
}

function requireNode(canvas: Canvas, id: string): void {
  if (!findNodeById(canvas, id)) {
    throw new Error(`No Canvas node with id "${id}"`)
  }
}

// Dependency direction is prerequisite → dependent. Idempotent on the (from, to) pair.
export function linkDependency(canvas: Canvas, fromId: string, toId: string): Canvas {
  requireNode(canvas, fromId)
  requireNode(canvas, toId)
  if (fromId === toId) {
    throw new Error('A task cannot depend on itself')
  }
  const id = dependencyEdgeId(fromId, toId)
  if (canvas.edges.some((edge) => edge.id === id)) {
    return canvas
  }
  const edge: CanvasEdge = { id, fromNode: fromId, toNode: toId, toEnd: 'arrow' }
  return { ...canvas, edges: [...canvas.edges, edge] }
}

export function unlinkDependency(canvas: Canvas, fromId: string, toId: string): Canvas {
  const id = dependencyEdgeId(fromId, toId)
  return { ...canvas, edges: canvas.edges.filter((edge) => edge.id !== id) }
}

// Find a phase group by label, or create one placed in free space to the right.
export function ensurePhaseGroup(
  canvas: Canvas,
  label: string
): { canvas: Canvas; group: CanvasGroupNode } {
  const existing = listGroupNodes(canvas).find((group) => group.label === label)
  if (existing) {
    return { canvas, group: existing }
  }
  const group: CanvasGroupNode = {
    id: uniqueNodeId(canvas, `phase-${slugify(label)}`),
    type: 'group',
    label,
    ...placePhaseGroup(canvas)
  }
  return { canvas: { ...canvas, nodes: [...canvas.nodes, group] }, group }
}

export function createPhase(canvas: Canvas, label: string): { canvas: Canvas; id: string } {
  if (listGroupNodes(canvas).some((group) => group.label === label)) {
    throw new Error(`A phase named "${label}" already exists`)
  }
  const { canvas: next, group } = ensurePhaseGroup(canvas, label)
  return { canvas: next, id: group.id }
}
