import { describe, expect, it } from 'vitest'
import { buildPlanView } from './canvas-plan-view-builder'
import { emptyCanvas } from './json-canvas-types'
import { createTask, setTaskStatus } from './canvas-task-mutations'

describe('buildPlanView', () => {
  it('projects tasks with derived readiness, phases, edges and geometry', () => {
    let canvas = createTask(emptyCanvas(), { title: 'setup', phase: 'Auth' }).canvas
    canvas = createTask(canvas, { title: 'login', phase: 'Auth', afterIds: ['setup'] }).canvas

    const blocked = buildPlanView(canvas)
    expect(blocked.tasks.map((t) => t.id).sort()).toEqual(['login', 'setup'])
    expect(blocked.tasks.find((t) => t.id === 'setup')?.ready).toBe(true)
    expect(blocked.tasks.find((t) => t.id === 'login')?.ready).toBe(false)
    expect(blocked.phases.map((p) => p.label)).toEqual(['Auth'])
    expect(blocked.edges).toEqual([{ id: 'dep-setup--login', fromNode: 'setup', toNode: 'login' }])

    const setupTask = blocked.tasks.find((t) => t.id === 'setup')!
    expect(typeof setupTask.x).toBe('number')
    expect(setupTask.width).toBeGreaterThan(0)
  })

  it('projects the task body for the detail dialog', () => {
    const canvas = createTask(emptyCanvas(), { title: 'setup', body: 'install deps' }).canvas
    expect(buildPlanView(canvas).tasks.find((t) => t.id === 'setup')?.body).toBe('install deps')
  })

  it('marks a task ready once its prerequisite is done', () => {
    let canvas = createTask(emptyCanvas(), { title: 'setup' }).canvas
    canvas = createTask(canvas, { title: 'login', afterIds: ['setup'] }).canvas
    canvas = setTaskStatus(canvas, 'setup', 'done')
    expect(buildPlanView(canvas).tasks.find((t) => t.id === 'login')?.ready).toBe(true)
  })

  it('returns empty arrays for an empty canvas', () => {
    expect(buildPlanView(emptyCanvas())).toEqual({
      tasks: [],
      phases: [],
      edges: [],
      artifacts: []
    })
  })
})
