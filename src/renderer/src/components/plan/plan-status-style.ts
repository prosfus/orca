import type { PlanTaskStatus } from '../../../../shared/plan/plan-view'

// Maps an orchestration task status to a quiet label + status-dot color. Mirrors
// the AgentStateDot palette (neutral/amber/emerald/red) so the Plan board reads
// the same as the rest of the app's agent surfaces.
export type PlanStatusStyle = {
  label: string
  dotClass: string
}

export function planStatusStyle(status: PlanTaskStatus): PlanStatusStyle {
  switch (status) {
    case 'pending':
      return { label: 'Pending', dotClass: 'bg-neutral-500/40' }
    case 'ready':
      return { label: 'Ready', dotClass: 'bg-sky-500' }
    case 'dispatched':
      return { label: 'Running', dotClass: 'bg-amber-500' }
    case 'completed':
      return { label: 'Done', dotClass: 'bg-emerald-500' }
    case 'failed':
      return { label: 'Failed', dotClass: 'bg-red-500' }
    case 'blocked':
      return { label: 'Blocked', dotClass: 'bg-amber-600' }
  }
}
