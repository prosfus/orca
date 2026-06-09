import { describe, expect, it } from 'vitest'
import type { CanvasStatus } from './canvas-status'
import { serializeTaskNodeText } from './canvas-task'
import type { Canvas, CanvasGroupNode, CanvasTextNode } from './json-canvas-types'
import { groupContaining, isTaskReady, prerequisiteIdsOf } from './canvas-graph'

function taskNode(id: string, status: CanvasStatus, x = 0, y = 0): CanvasTextNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width: 260,
    height: 120,
    text: serializeTaskNodeText({ status }, id, '')
  }
}

function group(id: string, x: number, y: number, width: number, height: number): CanvasGroupNode {
  return { id, type: 'group', x, y, width, height, label: id }
}

describe('canvas-graph dependencies + readiness', () => {
  const canvas: Canvas = {
    nodes: [taskNode('setup', 'done'), taskNode('login', 'todo'), taskNode('logout', 'todo')],
    edges: [
      { id: 'e1', fromNode: 'setup', toNode: 'login', toEnd: 'arrow' },
      { id: 'e2', fromNode: 'login', toNode: 'logout', toEnd: 'arrow' }
    ]
  }

  it('reads prerequisites from incoming edges', () => {
    expect(prerequisiteIdsOf(canvas, 'login')).toEqual(['setup'])
    expect(prerequisiteIdsOf(canvas, 'logout')).toEqual(['login'])
    expect(prerequisiteIdsOf(canvas, 'setup')).toEqual([])
  })

  it('is ready only when every prerequisite is done', () => {
    expect(isTaskReady(canvas, 'setup')).toBe(true) // no prereqs
    expect(isTaskReady(canvas, 'login')).toBe(true) // setup done
    expect(isTaskReady(canvas, 'logout')).toBe(false) // login not done
  })
})

describe('canvas-graph phase membership (geometry)', () => {
  it('places a task in the group whose rectangle encloses its centre', () => {
    const canvas: Canvas = {
      nodes: [group('Auth', 0, 0, 400, 400), taskNode('login', 'todo', 100, 100)],
      edges: []
    }
    const inside = canvas.nodes.find((n) => n.id === 'login')!
    expect(groupContaining(canvas, inside)?.label).toBe('Auth')
  })

  it('returns undefined when no group encloses the node', () => {
    const canvas: Canvas = {
      nodes: [group('Auth', 0, 0, 100, 100), taskNode('faraway', 'todo', 900, 900)],
      edges: []
    }
    const node = canvas.nodes.find((n) => n.id === 'faraway')!
    expect(groupContaining(canvas, node)).toBeUndefined()
  })
})
