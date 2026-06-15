import type { PlanPhaseView, PlanTaskView, PlanView } from '../../../../shared/plan/plan-view'
import { buildPlanColumns } from './plan-board-columns'
import { PlanTaskCard } from './PlanTaskCard'

function PhaseColumn({
  phase,
  tasks,
  selectedTaskId,
  onSelectTask
}: {
  phase: PlanPhaseView | null
  tasks: PlanTaskView[]
  selectedTaskId: string | null
  onSelectTask: (task: PlanTaskView) => void
}) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {phase ? phase.label : 'Unphased'}
          </span>
          {phase?.assignedAgent ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {phase.assignedAgent}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-sleek">
        {tasks.map((task) => (
          <PlanTaskCard
            key={task.id}
            task={task}
            selected={task.id === selectedTaskId}
            onSelect={onSelectTask}
          />
        ))}
        {tasks.length === 0 ? (
          <span className="px-1 py-2 text-[11px] text-muted-foreground">No tasks.</span>
        ) : null}
      </div>
    </div>
  )
}

export function PlanBoardView({
  plan,
  selectedTaskId,
  onSelectTask
}: {
  plan: PlanView
  selectedTaskId: string | null
  onSelectTask: (task: PlanTaskView) => void
}) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3 scrollbar-sleek">
      {buildPlanColumns(plan).map((col) => (
        <PhaseColumn
          key={col.key}
          phase={col.phase}
          tasks={col.tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
        />
      ))}
    </div>
  )
}
