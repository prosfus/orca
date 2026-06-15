import type { PlanPhaseView, PlanTaskView, PlanView } from '../../../../shared/plan/plan-view'

// Tasks with no phase land in a trailing "Unphased" column so nothing is hidden.
const UNPHASED = '__unphased__'

export type PlanColumn = {
  key: string
  phase: PlanPhaseView | null
  tasks: PlanTaskView[]
}

// Builds the board columns: one per phase (in the phases' given order) plus a
// trailing "Unphased" column when some tasks have no phase. Tasks keep their
// input order within a column.
export function buildPlanColumns(plan: PlanView): PlanColumn[] {
  const byPhase = new Map<string, PlanTaskView[]>()
  for (const task of plan.tasks) {
    const key = task.phaseId ?? UNPHASED
    const list = byPhase.get(key) ?? []
    list.push(task)
    byPhase.set(key, list)
  }
  const columns: PlanColumn[] = plan.phases.map((phase) => ({
    key: phase.id,
    phase,
    tasks: byPhase.get(phase.id) ?? []
  }))
  const unphased = byPhase.get(UNPHASED) ?? []
  if (unphased.length > 0) {
    columns.push({ key: UNPHASED, phase: null, tasks: unphased })
  }
  return columns
}
