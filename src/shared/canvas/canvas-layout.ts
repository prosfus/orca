// Coordinate placement for newly created nodes. The CLI places only NEW nodes (never moves
// existing ones — human drags stay authoritative). A node blocks placement; groups are
// containers and may overlap. All geometry is computed here so callers think in tasks, not px.

import type { Canvas, CanvasGroupNode } from './json-canvas-types'
import { findNodeById } from './canvas-document'

export const DEFAULT_NODE_SIZE = { width: 260, height: 140 }
const DEFAULT_GROUP_SIZE = { width: 560, height: 360 }
const GAP_X = 80
const GAP_Y = 40
const GROUP_PADDING = 40

export type Rect = { x: number; y: number; width: number; height: number }
type Size = { width: number; height: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function blockingRects(canvas: Canvas): Rect[] {
  return canvas.nodes.filter((node) => node.type !== 'group')
}

// Scan downward from `start` for the first slot that overlaps no existing node.
function firstFreeSlot(canvas: Canvas, start: { x: number; y: number }, size: Size): Rect {
  const blockers = blockingRects(canvas)
  let y = start.y
  for (let i = 0; i < 1000; i += 1) {
    const candidate = { x: start.x, y, width: size.width, height: size.height }
    if (!blockers.some((rect) => overlaps(candidate, rect))) {
      return candidate
    }
    y += size.height + GAP_Y
  }
  return { x: start.x, y, width: size.width, height: size.height }
}

function rightEdge(canvas: Canvas): number {
  return canvas.nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0)
}

// Place a free-standing task to the right of its latest prerequisite, else at the origin.
export function placeTaskNode(canvas: Canvas, afterIds: string[]): Rect {
  const anchors = afterIds
    .map((id) => findNodeById(canvas, id))
    .filter((node): node is NonNullable<typeof node> => node !== undefined)
  const anchor = anchors.reduce<(typeof anchors)[number] | undefined>(
    (best, node) => (!best || node.x > best.x ? node : best),
    undefined
  )
  const start = anchor ? { x: anchor.x + anchor.width + GAP_X, y: anchor.y } : { x: 0, y: 0 }
  return firstFreeSlot(canvas, start, DEFAULT_NODE_SIZE)
}

// Geometry for a brand-new phase group, placed to the right of existing content.
export function placePhaseGroup(canvas: Canvas): Rect {
  return {
    x: rightEdge(canvas) > 0 ? rightEdge(canvas) + GAP_X : 0,
    y: 0,
    ...DEFAULT_GROUP_SIZE
  }
}

export function placeTaskNodeInGroup(canvas: Canvas, group: CanvasGroupNode): Rect {
  const start = { x: group.x + GROUP_PADDING, y: group.y + GROUP_PADDING }
  return firstFreeSlot(canvas, start, DEFAULT_NODE_SIZE)
}

// Grow a group's rectangle so it encloses a child placed inside it (with padding).
export function growGroupToInclude(group: CanvasGroupNode, child: Rect): CanvasGroupNode {
  const right = Math.max(group.x + group.width, child.x + child.width + GROUP_PADDING)
  const bottom = Math.max(group.y + group.height, child.y + child.height + GROUP_PADDING)
  return { ...group, width: right - group.x, height: bottom - group.y }
}
