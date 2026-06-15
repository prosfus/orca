// Render-ready projection of the global Orchestration DAG for the Plan board.
// Pure types only (no node imports) so both main and the renderer can import it.
// The Plan board is a read-only projection: every mutation goes through the
// orchestration RPC/CLI so the coordinator's invariants always hold.

export type PlanTaskStatus = 'pending' | 'ready' | 'dispatched' | 'completed' | 'failed' | 'blocked'

export type PlanTaskView = {
  id: string
  spec: string
  status: PlanTaskStatus
  phaseId: string | null
  deps: string[]
  // Terminal handle of the agent currently working this task (its active
  // dispatch), if any — lets the board jump to that agent's terminal.
  assigneeHandle: string | null
  dispatchId: string | null
}

export type PlanPhaseView = {
  id: string
  label: string
  orderIndex: number
  assignedAgent: string | null
}

export type PlanView = {
  phases: PlanPhaseView[]
  tasks: PlanTaskView[]
}

export type PlanReadResult = {
  // True once the DAG holds at least one phase or task (drives the empty state).
  exists: boolean
  plan: PlanView
}
