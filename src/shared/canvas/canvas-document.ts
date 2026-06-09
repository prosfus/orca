// Read-only typed accessors over a parsed Canvas. By convention every `text` node is a
// Canvas task; `group` nodes are phases; `file`/`link` nodes are artifacts. Pure — no I/O.

import {
  isGroupNode,
  isTextNode,
  type Canvas,
  type CanvasGroupNode,
  type CanvasNode,
  type CanvasTextNode
} from './json-canvas-types'
import { parseTaskNodeText, type CanvasTask } from './canvas-task'
import type { CanvasStatus } from './canvas-status'

export function findNodeById(canvas: Canvas, id: string): CanvasNode | undefined {
  return canvas.nodes.find((node) => node.id === id)
}

export function listTaskNodes(canvas: Canvas): CanvasTextNode[] {
  return canvas.nodes.filter(isTextNode)
}

export function listGroupNodes(canvas: Canvas): CanvasGroupNode[] {
  return canvas.nodes.filter(isGroupNode)
}

export function readTask(node: CanvasTextNode): CanvasTask {
  const { frontMatter, title, body } = parseTaskNodeText(node.text)
  return { id: node.id, title, body, ...frontMatter }
}

export function getTask(canvas: Canvas, id: string): CanvasTask | undefined {
  const node = findNodeById(canvas, id)
  return node && isTextNode(node) ? readTask(node) : undefined
}

export function listTasks(canvas: Canvas): CanvasTask[] {
  return listTaskNodes(canvas).map(readTask)
}

export function taskStatusById(canvas: Canvas): Map<string, CanvasStatus> {
  return new Map(listTasks(canvas).map((task) => [task.id, task.status]))
}

// True when a slug is already used by any node (tasks, phases, artifacts share id space).
export function hasNodeId(canvas: Canvas, id: string): boolean {
  return canvas.nodes.some((node) => node.id === id)
}
