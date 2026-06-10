import { describe, expect, it } from 'vitest'
import type { CanvasPlanView } from '../../../../shared/canvas/canvas-plan-view'
import { planToFlow } from './canvas-flow-mapping'

const plan: CanvasPlanView = {
  tasks: [
    {
      id: 'login',
      title: 'Login',
      body: '',
      status: 'todo',
      ready: true,
      x: 0,
      y: 0,
      width: 260,
      height: 140
    }
  ],
  phases: [{ id: 'phase-auth', label: 'Auth', x: -20, y: -20, width: 400, height: 300 }],
  edges: [{ id: 'dep-a--login', fromNode: 'a', toNode: 'login' }],
  artifacts: [
    { id: 'art-1', kind: 'file', target: 'src/login.ts', x: 300, y: 0, width: 180, height: 60 }
  ]
}

describe('planToFlow', () => {
  it('maps phases, tasks, artifacts and edges', () => {
    const flow = planToFlow(plan)
    expect(flow.nodes).toHaveLength(3)
    expect(flow.nodes.find((node) => node.id === 'login')?.type).toBe('task')
    expect(flow.nodes.find((node) => node.id === 'art-1')?.type).toBe('artifact')
    expect(flow.edges).toEqual([{ id: 'dep-a--login', source: 'a', target: 'login' }])
  })

  it('renders phase groups behind tasks (lower zIndex)', () => {
    const flow = planToFlow(plan)
    expect(flow.nodes.find((node) => node.id === 'phase-auth')?.zIndex).toBe(0)
    expect(flow.nodes.find((node) => node.id === 'login')?.zIndex).toBe(1)
  })

  it('positions nodes at their real file coordinates', () => {
    const login = planToFlow(plan).nodes.find((node) => node.id === 'login')
    expect(login?.position).toEqual({ x: 0, y: 0 })
  })

  it('keeps tasks/artifacts fixed when read-only and draggable when editable', () => {
    const readOnly = planToFlow(plan)
    expect(readOnly.nodes.find((node) => node.id === 'login')?.draggable).toBe(false)
    expect(readOnly.nodes.find((node) => node.id === 'art-1')?.draggable).toBe(false)

    const editable = planToFlow(plan, true)
    expect(editable.nodes.find((node) => node.id === 'login')?.draggable).toBe(true)
    expect(editable.nodes.find((node) => node.id === 'art-1')?.draggable).toBe(true)
    // Phase groups are containers — never draggable, even in edit mode.
    expect(editable.nodes.find((node) => node.id === 'phase-auth')?.draggable).toBe(false)
  })
})
