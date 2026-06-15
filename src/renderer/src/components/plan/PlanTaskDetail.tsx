import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PlanTaskView } from '../../../../shared/plan/plan-view'
import { planStatusStyle } from './plan-status-style'

// Right-side detail for a selected task. Agent navigation ("jump to terminal")
// is wired in a later step once the handle→pane resolution is in place.
export function PlanTaskDetail({ task, onClose }: { task: PlanTaskView; onClose: () => void }) {
  const style = planStatusStyle(task.status)
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[13px] font-semibold text-card-foreground">Task</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-3 scrollbar-sleek">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${style.dotClass}`} aria-hidden />
          <span className="text-[12px] text-muted-foreground">{style.label}</span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] text-card-foreground">{task.spec}</p>
        {task.assigneeHandle ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">Agent</span>
            <span className="break-all text-[12px] text-card-foreground">
              {task.assigneeHandle}
            </span>
          </div>
        ) : null}
        {task.deps.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">Depends on</span>
            <span className="break-all text-[12px] text-card-foreground">
              {task.deps.join(', ')}
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
