import { ipcMain } from 'electron'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PlanReadResult, PlanTaskView, PlanView } from '../../shared/plan/plan-view'

// Why: deps are stored as a JSON string on the task row; tolerate a malformed
// value by treating it as no-deps rather than throwing in the read path.
function parseDeps(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

// Projects the global Orchestration DAG (phases + tasks + active assignees) to
// the flat, render-ready PlanView. Reads the in-process OrchestrationDb directly
// — the runtime lives in the main process, same as the Canvas read path.
function buildPlanView(runtime: OrcaRuntimeService): PlanView {
  const db = runtime.getOrchestrationDb()
  const phases = db.listPhases().map((p) => ({
    id: p.id,
    label: p.label,
    orderIndex: p.order_index,
    assignedAgent: p.assigned_agent
  }))
  const tasks: PlanTaskView[] = db.listTasksWithDispatch().map((t) => ({
    id: t.id,
    spec: t.spec,
    status: t.status,
    phaseId: t.phase_id,
    deps: parseDeps(t.deps),
    assigneeHandle: t.assignee_handle,
    dispatchId: t.dispatch_id
  }))
  return { phases, tasks }
}

export function registerPlanHandlers(runtime: OrcaRuntimeService): void {
  ipcMain.handle('plan:read', (): PlanReadResult => {
    const plan = buildPlanView(runtime)
    return { exists: plan.tasks.length > 0 || plan.phases.length > 0, plan }
  })
}
