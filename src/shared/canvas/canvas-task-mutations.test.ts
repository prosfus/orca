import { describe, expect, it } from 'vitest'
import { findNodeById, getTask, listGroupNodes } from './canvas-document'
import { groupContaining, prerequisiteIdsOf } from './canvas-graph'
import { emptyCanvas, isTextNode } from './json-canvas-types'
import {
  claimTask,
  createTask,
  releaseTask,
  removeTask,
  setTaskStatus
} from './canvas-task-mutations'

const NOW = Date.parse('2026-06-09T10:00:00Z')

describe('createTask', () => {
  it('mints a slug id, starts todo with no color, and places the node', () => {
    const { canvas, id } = createTask(emptyCanvas(), { title: 'Implementar login' })
    expect(id).toBe('implementar-login')
    const task = getTask(canvas, id)
    expect(task?.status).toBe('todo')
    const node = findNodeById(canvas, id)
    expect(node && isTextNode(node) ? node.color : 'set').toBeUndefined()
  })

  it('links --after prerequisites as edges', () => {
    let canvas = emptyCanvas()
    canvas = createTask(canvas, { title: 'setup' }).canvas
    const created = createTask(canvas, { title: 'login', afterIds: ['setup'] })
    expect(prerequisiteIdsOf(created.canvas, created.id)).toEqual(['setup'])
  })

  it('creates the phase group and places the task inside it', () => {
    const { canvas, id } = createTask(emptyCanvas(), { title: 'login', phase: 'Auth' })
    expect(listGroupNodes(canvas).map((g) => g.label)).toEqual(['Auth'])
    const node = findNodeById(canvas, id)!
    expect(groupContaining(canvas, node)?.label).toBe('Auth')
  })
})

describe('status + claim lifecycle', () => {
  it('mirrors status to a color preset', () => {
    let canvas = createTask(emptyCanvas(), { title: 'x' }).canvas
    canvas = setTaskStatus(canvas, 'x', 'in-progress')
    const node = findNodeById(canvas, 'x')
    expect(node && isTextNode(node) ? node.color : undefined).toBe('3')
  })

  it('claims a task atomically and refuses a second live claim', () => {
    let canvas = createTask(emptyCanvas(), { title: 'x' }).canvas
    canvas = claimTask(canvas, 'x', 'paneA', NOW)
    const task = getTask(canvas, 'x')
    expect(task?.owner).toBe('paneA')
    expect(task?.status).toBe('in-progress')
    expect(() => claimTask(canvas, 'x', 'paneB', NOW + 1000)).toThrow(/already claimed/)
  })

  it('allows a steal and a release', () => {
    let canvas = createTask(emptyCanvas(), { title: 'x' }).canvas
    canvas = claimTask(canvas, 'x', 'paneA', NOW)
    canvas = claimTask(canvas, 'x', 'paneB', NOW + 1000, { steal: true })
    expect(getTask(canvas, 'x')?.owner).toBe('paneB')
    canvas = releaseTask(canvas, 'x')
    expect(getTask(canvas, 'x')?.owner).toBeUndefined()
    expect(getTask(canvas, 'x')?.status).toBe('todo')
  })
})

describe('removeTask', () => {
  it('refuses to remove a task with dependents unless forced', () => {
    let canvas = createTask(emptyCanvas(), { title: 'setup' }).canvas
    canvas = createTask(canvas, { title: 'login', afterIds: ['setup'] }).canvas
    expect(() => removeTask(canvas, 'setup')).toThrow(/dependents/)
    const forced = removeTask(canvas, 'setup', { force: true })
    expect(getTask(forced, 'setup')).toBeUndefined()
    expect(prerequisiteIdsOf(forced, 'login')).toEqual([])
  })
})
