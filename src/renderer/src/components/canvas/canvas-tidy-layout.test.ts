import { describe, expect, it } from 'vitest'
import type { CanvasPlanView } from '../../../../shared/canvas/canvas-plan-view'
import { computeTidyLayout } from './canvas-tidy-layout'

function task(id: string): CanvasPlanView['tasks'][number] {
  return {
    id,
    title: id,
    body: '',
    status: 'todo',
    ready: true,
    x: 0,
    y: 0,
    width: 260,
    height: 140
  }
}

describe('computeTidyLayout', () => {
  it('places a task one column right of its deepest prerequisite', () => {
    const plan: CanvasPlanView = {
      tasks: [task('a'), task('b'), task('c')],
      phases: [],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },
        { id: 'e2', fromNode: 'b', toNode: 'c' }
      ],
      artifacts: []
    }
    const layout = computeTidyLayout(plan)
    const xOf = (id: string) => layout.find((node) => node.id === id)?.x
    expect(xOf('a')).toBe(0)
    expect(xOf('b')).toBeGreaterThan(xOf('a') as number)
    expect(xOf('c')).toBeGreaterThan(xOf('b') as number)
  })

  it('stacks independent roots in the same column on different rows', () => {
    const plan: CanvasPlanView = {
      tasks: [task('a'), task('b')],
      phases: [],
      edges: [],
      artifacts: []
    }
    const layout = computeTidyLayout(plan)
    expect(layout.map((node) => node.x)).toEqual([0, 0])
    expect(layout[0].y).not.toBe(layout[1].y)
  })
})
