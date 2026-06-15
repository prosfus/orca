import type { PlanTaskView } from '../../../../shared/plan/plan-view'
import { planStatusStyle } from './plan-status-style'

export function PlanTaskCard({
  task,
  selected,
  onSelect
}: {
  task: PlanTaskView
  selected: boolean
  onSelect: (task: PlanTaskView) => void
}) {
  const style = planStatusStyle(task.status)
  const running = task.status === 'dispatched'
  return (
    <button
      type="button"
      onClick={() => onSelect(task)}
      data-current={selected ? 'true' : undefined}
      className="flex w-full flex-col gap-1 rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent data-[current=true]:bg-accent"
    >
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-1 size-2 shrink-0 rounded-full ${style.dotClass} ${
            running ? 'animate-pulse' : ''
          }`}
          aria-hidden
        />
        <span className="line-clamp-2 text-[13px] text-card-foreground">{task.spec}</span>
      </div>
      {task.assigneeHandle ? (
        <span className="truncate pl-3.5 text-[10px] text-muted-foreground">
          {task.assigneeHandle}
        </span>
      ) : null}
    </button>
  )
}
