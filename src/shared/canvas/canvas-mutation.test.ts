import { describe, expect, it } from 'vitest'
import { findNodeById, getTask } from './canvas-document'
import { applyMutation, mutationToArgv, type CanvasMutation } from './canvas-mutation'
import { createTask } from './canvas-task-mutations'
import { emptyCanvas } from './json-canvas-types'

describe('applyMutation', () => {
  it('creates, edits status, and moves a node', () => {
    let canvas = applyMutation(emptyCanvas(), {
      op: 'createTask',
      title: 'login',
      priority: 'high'
    })
    expect(getTask(canvas, 'login')?.priority).toBe('high')
    canvas = applyMutation(canvas, { op: 'setStatus', id: 'login', status: 'in-progress' })
    expect(getTask(canvas, 'login')?.status).toBe('in-progress')
    canvas = applyMutation(canvas, { op: 'setPosition', id: 'login', x: 500, y: 300 })
    const node = findNodeById(canvas, 'login')
    expect(node ? { x: node.x, y: node.y } : null).toEqual({ x: 500, y: 300 })
  })

  it('links and unlinks dependencies, and releases a claim', () => {
    let canvas = createTask(emptyCanvas(), { title: 'a' }).canvas
    canvas = createTask(canvas, { title: 'b' }).canvas
    canvas = applyMutation(canvas, { op: 'link', from: 'a', to: 'b' })
    expect(canvas.edges).toHaveLength(1)
    canvas = applyMutation(canvas, { op: 'unlink', from: 'a', to: 'b' })
    expect(canvas.edges).toHaveLength(0)
  })
})

describe('mutationToArgv', () => {
  it('maps each op to CLI argv', () => {
    const cases: [CanvasMutation, string[]][] = [
      [
        { op: 'createTask', title: 'Login', phase: 'Auth', afterIds: ['a', 'b'], priority: 'high' },
        ['add-task', 'Login', '--phase', 'Auth', '--after', 'a,b', '--priority', 'high']
      ],
      [{ op: 'setStatus', id: 'x', status: 'done' }, ['set-status', 'x', 'done']],
      [{ op: 'setPosition', id: 'x', x: 10, y: 20 }, ['set-position', 'x', '10', '20']],
      [{ op: 'link', from: 'a', to: 'b' }, ['link', 'a', 'b']],
      [{ op: 'removeTask', id: 'x', force: true }, ['remove-task', 'x', '--force']],
      [{ op: 'release', id: 'x' }, ['release', 'x']]
    ]
    for (const [mutation, argv] of cases) {
      expect(mutationToArgv(mutation)).toEqual(argv)
    }
  })
})
