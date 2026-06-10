// One mutation type, two mappers. The Canvas editor (Milestone 3) describes every edit as a
// CanvasMutation; main applies it in-process for local worktrees (applyMutation → engine) and
// runs it as the `orca canvas` CLI for remote ones (mutationToArgv → argv). Pure, no I/O.

import { createPhase, linkDependency, unlinkDependency } from './canvas-structure-mutations'
import {
  createTask,
  moveNode,
  releaseTask,
  removeTask,
  setTaskFields,
  setTaskStatus
} from './canvas-task-mutations'
import type { CanvasStatus } from './canvas-status'
import type { CanvasPriority } from './canvas-task'
import type { Canvas } from './json-canvas-types'

export type CanvasMutation =
  | {
      op: 'createTask'
      title: string
      afterIds?: string[]
      phase?: string
      priority?: CanvasPriority
      est?: string
      ref?: string
      body?: string
    }
  | {
      op: 'setFields'
      id: string
      title?: string
      body?: string
      priority?: CanvasPriority
      est?: string
      ref?: string
    }
  | { op: 'setStatus'; id: string; status: CanvasStatus }
  | { op: 'setPosition'; id: string; x: number; y: number }
  | { op: 'link'; from: string; to: string }
  | { op: 'unlink'; from: string; to: string }
  | { op: 'createPhase'; label: string }
  | { op: 'removeTask'; id: string; force?: boolean }
  | { op: 'release'; id: string }

export function applyMutation(canvas: Canvas, mutation: CanvasMutation): Canvas {
  switch (mutation.op) {
    case 'createTask':
      return createTask(canvas, {
        title: mutation.title,
        afterIds: mutation.afterIds,
        phase: mutation.phase,
        priority: mutation.priority,
        est: mutation.est,
        ref: mutation.ref,
        body: mutation.body
      }).canvas
    case 'setFields':
      return setTaskFields(canvas, mutation.id, {
        title: mutation.title,
        body: mutation.body,
        priority: mutation.priority,
        est: mutation.est,
        ref: mutation.ref
      })
    case 'setStatus':
      return setTaskStatus(canvas, mutation.id, mutation.status)
    case 'setPosition':
      return moveNode(canvas, mutation.id, mutation.x, mutation.y)
    case 'link':
      return linkDependency(canvas, mutation.from, mutation.to)
    case 'unlink':
      return unlinkDependency(canvas, mutation.from, mutation.to)
    case 'createPhase':
      return createPhase(canvas, mutation.label).canvas
    case 'removeTask':
      return removeTask(canvas, mutation.id, { force: mutation.force })
    case 'release':
      return releaseTask(canvas, mutation.id)
  }
}

export function mutationToArgv(mutation: CanvasMutation): string[] {
  switch (mutation.op) {
    case 'createTask': {
      const argv = ['add-task', mutation.title]
      if (mutation.phase) {
        argv.push('--phase', mutation.phase)
      }
      if (mutation.afterIds && mutation.afterIds.length > 0) {
        argv.push('--after', mutation.afterIds.join(','))
      }
      if (mutation.priority) {
        argv.push('--priority', mutation.priority)
      }
      if (mutation.est) {
        argv.push('--est', mutation.est)
      }
      if (mutation.ref) {
        argv.push('--ref', mutation.ref)
      }
      if (mutation.body) {
        argv.push('--desc', mutation.body)
      }
      return argv
    }
    case 'setFields': {
      const argv = ['set', mutation.id]
      if (mutation.title !== undefined) {
        argv.push('--title', mutation.title)
      }
      if (mutation.body !== undefined) {
        argv.push('--desc', mutation.body)
      }
      if (mutation.priority !== undefined) {
        argv.push('--priority', mutation.priority)
      }
      if (mutation.est !== undefined) {
        argv.push('--est', mutation.est)
      }
      if (mutation.ref !== undefined) {
        argv.push('--ref', mutation.ref)
      }
      return argv
    }
    case 'setStatus':
      return ['set-status', mutation.id, mutation.status]
    case 'setPosition':
      return ['set-position', mutation.id, String(mutation.x), String(mutation.y)]
    case 'link':
      return ['link', mutation.from, mutation.to]
    case 'unlink':
      return ['unlink', mutation.from, mutation.to]
    case 'createPhase':
      return ['add-phase', mutation.label]
    case 'removeTask':
      return mutation.force ? ['remove-task', mutation.id, '--force'] : ['remove-task', mutation.id]
    case 'release':
      return ['release', mutation.id]
  }
}
