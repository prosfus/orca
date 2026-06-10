// Detail view + editor for a single Canvas task, opened from a task node. Edits are buffered
// in local drafts and flushed on Save as a setFields (+ setStatus) mutation, so a mid-edit poll
// can't clobber the form. Remote/read-only workspaces render the same fields disabled.

import { useState } from 'react'
import { Trash2, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CanvasMarkdownField } from './CanvasMarkdownField'
import type { CanvasMutation } from '../../../../shared/canvas/canvas-mutation'
import { CANVAS_PRIORITIES, type CanvasPriority } from '../../../../shared/canvas/canvas-task'
import { CANVAS_STATUSES, type CanvasStatus } from '../../../../shared/canvas/canvas-status'
import type { CanvasTaskView } from '../../../../shared/canvas/canvas-plan-view'

type Props = {
  task: CanvasTaskView
  editable: boolean
  ownerStale: boolean
  mutate: (mutation: CanvasMutation) => void
  onClose: () => void
}

export function CanvasTaskDialog({ task, editable, ownerStale, mutate, onClose }: Props) {
  // Keyed by task.id at the call site, so these initialise fresh per task (no reset effect).
  const [title, setTitle] = useState(task.title)
  const [body, setBody] = useState(task.body)
  const [status, setStatus] = useState<CanvasStatus>(task.status)
  const [priority, setPriority] = useState<CanvasPriority>(task.priority ?? 'normal')
  const [est, setEst] = useState(task.est ?? '')
  const [ref, setRef] = useState(task.ref ?? '')

  const save = (): void => {
    const fields: Extract<CanvasMutation, { op: 'setFields' }> = { op: 'setFields', id: task.id }
    if (title.trim() && title !== task.title) {
      fields.title = title.trim()
    }
    if (body !== task.body) {
      fields.body = body
    }
    if (priority !== (task.priority ?? 'normal')) {
      fields.priority = priority
    }
    if (est !== (task.est ?? '')) {
      fields.est = est
    }
    if (ref !== (task.ref ?? '')) {
      fields.ref = ref
    }
    // Only emit setFields when something beyond status actually changed.
    if (Object.keys(fields).length > 2) {
      mutate(fields)
    }
    if (status !== task.status) {
      mutate({ op: 'setStatus', id: task.id, status })
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editable ? 'Edit task' : 'Task details'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              disabled={!editable}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                disabled={!editable}
                onValueChange={(value) => setStatus(value as CanvasStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANVAS_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                disabled={!editable}
                onValueChange={(value) => setPriority(value as CanvasPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANVAS_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="task-est">Estimate</Label>
              <Input
                id="task-est"
                value={est}
                placeholder="e.g. 2h"
                disabled={!editable}
                onChange={(event) => setEst(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-ref">Ref</Label>
              <Input
                id="task-ref"
                value={ref}
                placeholder="e.g. #123"
                disabled={!editable}
                onChange={(event) => setRef(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Description</Label>
            <CanvasMarkdownField value={body} editable={editable} onChange={setBody} />
          </div>

          {task.owner ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Owner: <span className={ownerStale ? 'text-destructive' : ''}>@{task.owner}</span>
                {ownerStale ? ' (stale)' : null}
              </span>
              {editable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mutate({ op: 'release', id: task.id })}
                >
                  <UserMinus className="size-4" /> Release
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {editable ? (
          <DialogFooter className="sm:justify-between">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                mutate({ op: 'removeTask', id: task.id, force: true })
                onClose()
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
