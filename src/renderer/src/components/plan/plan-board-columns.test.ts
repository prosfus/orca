import { describe, expect, it } from 'vitest'
import { buildPlanColumns } from './plan-board-columns'
import type { PlanTaskStatus, PlanView } from '../../../../shared/plan/plan-view'

function task(id: string, phaseId: string | null, status: PlanTaskStatus = 'ready') {
  return { id, spec: id, status, phaseId, deps: [], assigneeHandle: null, dispatchId: null }
}

describe('buildPlanColumns', () => {
  it('builds one column per phase in order, with tasks grouped', () => {
    const plan: PlanView = {
      phases: [
        { id: 'p1', label: 'Plan', orderIndex: 0, assignedAgent: 'claude' },
        { id: 'p2', label: 'Build', orderIndex: 1, assignedAgent: null }
      ],
      tasks: [task('a', 'p1'), task('b', 'p2'), task('c', 'p1')]
    }
    const cols = buildPlanColumns(plan)
    expect(cols.map((c) => c.phase?.label)).toEqual(['Plan', 'Build'])
    expect(cols[0].tasks.map((t) => t.id)).toEqual(['a', 'c'])
    expect(cols[1].tasks.map((t) => t.id)).toEqual(['b'])
  })

  it('appends an Unphased column for tasks with no phase', () => {
    const plan: PlanView = {
      phases: [{ id: 'p1', label: 'Plan', orderIndex: 0, assignedAgent: null }],
      tasks: [task('a', 'p1'), task('x', null)]
    }
    const cols = buildPlanColumns(plan)
    expect(cols).toHaveLength(2)
    expect(cols[1].phase).toBeNull()
    expect(cols[1].tasks.map((t) => t.id)).toEqual(['x'])
  })

  it('has no Unphased column when every task has a phase', () => {
    const plan: PlanView = {
      phases: [{ id: 'p1', label: 'Plan', orderIndex: 0, assignedAgent: null }],
      tasks: [task('a', 'p1')]
    }
    expect(buildPlanColumns(plan)).toHaveLength(1)
  })

  it('keeps an empty phase column (no tasks) so the phase still shows', () => {
    const plan: PlanView = {
      phases: [{ id: 'p1', label: 'Empty', orderIndex: 0, assignedAgent: null }],
      tasks: []
    }
    const cols = buildPlanColumns(plan)
    expect(cols).toHaveLength(1)
    expect(cols[0].tasks).toEqual([])
  })
})
