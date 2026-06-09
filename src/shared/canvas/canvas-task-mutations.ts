// Pure delta operations on a task's LIFECYCLE (create, edit, status, claim/release, remove).
// Each returns a new Canvas; none performs I/O. Placement is delegated to canvas-layout so the
// CLI only ever positions NEW nodes — existing nodes (human-dragged) are never moved.

import { hasActiveClaim } from './canvas-coordination'
import { findNodeById } from './canvas-document'
import { dependentIdsOf } from './canvas-graph'
import { slugify, uniqueNodeId } from './canvas-id'
import { growGroupToInclude, placeTaskNode, placeTaskNodeInGroup, type Rect } from './canvas-layout'
import { colorForStatus, type CanvasStatus } from './canvas-status'
import {
  parseTaskNodeText,
  serializeTaskNodeText,
  type CanvasPriority,
  type CanvasTask,
  type CanvasTaskFrontMatter
} from './canvas-task'
import { ensurePhaseGroup, linkDependency } from './canvas-structure-mutations'
import type { Canvas, CanvasTextNode } from './json-canvas-types'

export type CreateTaskInput = {
  title: string
  body?: string
  afterIds?: string[]
  phase?: string
  priority?: CanvasPriority
  est?: string
  ref?: string
}

export function createTask(canvas: Canvas, input: CreateTaskInput): { canvas: Canvas; id: string } {
  const id = uniqueNodeId(canvas, slugify(input.title))
  let working = canvas
  let rect: Rect
  if (input.phase) {
    const ensured = ensurePhaseGroup(working, input.phase)
    rect = placeTaskNodeInGroup(ensured.canvas, ensured.group)
    const grown = growGroupToInclude(ensured.group, rect)
    working = {
      ...ensured.canvas,
      nodes: ensured.canvas.nodes.map((node) => (node.id === ensured.group.id ? grown : node))
    }
  } else {
    rect = placeTaskNode(working, input.afterIds ?? [])
  }
  const frontMatter: CanvasTaskFrontMatter = {
    status: 'todo',
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.est ? { est: input.est } : {}),
    ...(input.ref ? { ref: input.ref } : {})
  }
  const node: CanvasTextNode = {
    id,
    type: 'text',
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    text: serializeTaskNodeText(frontMatter, input.title, input.body ?? '')
  }
  working = { ...working, nodes: [...working.nodes, node] }
  for (const afterId of input.afterIds ?? []) {
    working = linkDependency(working, afterId, id)
  }
  return { canvas: working, id }
}

type ParsedTask = { frontMatter: CanvasTaskFrontMatter; title: string; body: string }

function updateTaskNode(
  canvas: Canvas,
  id: string,
  transform: (current: ParsedTask) => ParsedTask
): Canvas {
  const node = findNodeById(canvas, id)
  if (!node || node.type !== 'text') {
    throw new Error(`No Canvas task with id "${id}"`)
  }
  const next = transform(parseTaskNodeText(node.text))
  const updated: CanvasTextNode = {
    ...node,
    text: serializeTaskNodeText(next.frontMatter, next.title, next.body),
    color: colorForStatus(next.frontMatter.status)
  }
  return {
    ...canvas,
    nodes: canvas.nodes.map((current) => (current.id === id ? updated : current))
  }
}

export type TaskFieldUpdates = {
  title?: string
  body?: string
  priority?: CanvasPriority
  est?: string
  ref?: string
}

export function setTaskFields(canvas: Canvas, id: string, updates: TaskFieldUpdates): Canvas {
  return updateTaskNode(canvas, id, ({ frontMatter, title, body }) => ({
    frontMatter: {
      ...frontMatter,
      ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
      ...(updates.est !== undefined ? { est: updates.est } : {}),
      ...(updates.ref !== undefined ? { ref: updates.ref } : {})
    },
    title: updates.title ?? title,
    body: updates.body ?? body
  }))
}

export function setTaskStatus(canvas: Canvas, id: string, status: CanvasStatus): Canvas {
  return updateTaskNode(canvas, id, ({ frontMatter, title, body }) => ({
    frontMatter: { ...frontMatter, status },
    title,
    body
  }))
}

export function claimTask(
  canvas: Canvas,
  id: string,
  owner: string,
  now: number,
  opts: { steal?: boolean } = {}
): Canvas {
  const node = findNodeById(canvas, id)
  if (!node || node.type !== 'text') {
    throw new Error(`No Canvas task with id "${id}"`)
  }
  const parsed = parseTaskNodeText(node.text)
  const current: CanvasTask = { id, title: parsed.title, body: parsed.body, ...parsed.frontMatter }
  if (current.status === 'done') {
    throw new Error(`Task "${id}" is already done`)
  }
  if (!opts.steal && current.owner && current.owner !== owner && hasActiveClaim(current, now)) {
    throw new Error(`Task "${id}" is already claimed by ${current.owner}`)
  }
  return updateTaskNode(canvas, id, ({ frontMatter, title, body }) => ({
    frontMatter: {
      ...frontMatter,
      status: 'in-progress',
      owner,
      claimedAt: new Date(now).toISOString()
    },
    title,
    body
  }))
}

export function releaseTask(canvas: Canvas, id: string): Canvas {
  return updateTaskNode(canvas, id, ({ frontMatter, title, body }) => ({
    frontMatter: {
      ...frontMatter,
      owner: undefined,
      claimedAt: undefined,
      status: frontMatter.status === 'done' ? 'done' : 'todo'
    },
    title,
    body
  }))
}

export function removeTask(canvas: Canvas, id: string, opts: { force?: boolean } = {}): Canvas {
  const node = findNodeById(canvas, id)
  if (!node || node.type !== 'text') {
    throw new Error(`No Canvas task with id "${id}"`)
  }
  const dependents = dependentIdsOf(canvas, id)
  if (dependents.length > 0 && !opts.force) {
    throw new Error(
      `Task "${id}" has dependents (${dependents.join(', ')}); pass --force to remove`
    )
  }
  return {
    nodes: canvas.nodes.filter((current) => current.id !== id),
    edges: canvas.edges.filter((edge) => edge.fromNode !== id && edge.toNode !== id)
  }
}
