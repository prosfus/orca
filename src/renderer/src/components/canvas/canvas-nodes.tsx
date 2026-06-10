// Custom react-flow node renderers. In the editable board the status dot cycles status and the
// title is double-click editable; both go through the shared edit context. Quiet shadcn styling;
// the status dot is the one semantic-color mirror (STYLEGUIDE).

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { FileText, Link2, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import type { CanvasArtifactView, CanvasTaskView } from '../../../../shared/canvas/canvas-plan-view'
import { nextStatus, useCanvasEdit } from './canvas-edit-context'
import { statusColorVar } from './canvas-status-style'

type TaskNodeModel = Node<CanvasTaskView, 'task'>
type ArtifactNodeModel = Node<CanvasArtifactView, 'artifact'>
type PhaseNodeModel = Node<{ label: string }, 'phase'>

// A dependency handle: invisible until the node is hovered, so the board stays calm but each
// task exposes a drag-from point on approach. Read-only boards hide it entirely.
const handleClass =
  '!size-2.5 !border !border-background !bg-primary opacity-0 transition-opacity group-hover:opacity-100'

export function TaskNode({ data }: NodeProps<TaskNodeModel>) {
  const { editable, mutate, isStale, openTask } = useCanvasEdit()
  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const ownerStale = isStale(data.owner)

  const commitTitle = (): void => {
    setEditingTitle(false)
    const title = draft.trim()
    if (title.length > 0 && title !== data.title) {
      mutate({ op: 'setFields', id: data.id, title })
    }
  }

  return (
    <div className="group relative flex h-full w-full flex-col gap-1 rounded-md border bg-card p-2 text-card-foreground shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={editable}
        className={editable ? handleClass : '!opacity-0'}
      />
      <button
        type="button"
        aria-label="Open task details"
        className="nodrag absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        onClick={() => openTask(data.id)}
      >
        <Maximize2 className="size-3" />
      </button>
      <div className="flex items-center gap-1.5 pr-4">
        <button
          type="button"
          aria-label={`status: ${data.status}`}
          className="nodrag size-2 shrink-0 rounded-full"
          style={{ backgroundColor: statusColorVar(data.status) }}
          onClick={
            editable
              ? () => mutate({ op: 'setStatus', id: data.id, status: nextStatus(data.status) })
              : undefined
          }
        />
        {editingTitle ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTitle()
              }
            }}
            className="nodrag w-full bg-transparent text-sm font-medium outline-none"
          />
        ) : (
          <span
            className="truncate text-sm font-medium"
            onDoubleClick={
              editable
                ? () => {
                    setDraft(data.title)
                    setEditingTitle(true)
                  }
                : undefined
            }
          >
            {data.title}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {data.ready && data.status === 'todo' ? <span>ready</span> : null}
        {data.priority && data.priority !== 'normal' ? <span>{data.priority}</span> : null}
        {data.owner ? (
          <span className={`truncate ${ownerStale ? 'text-destructive' : ''}`}>@{data.owner}</span>
        ) : null}
        {/* A claim whose agent pane is gone is stale; offer the human a one-click release. */}
        {ownerStale ? <span className="text-destructive">(stale)</span> : null}
        {ownerStale && editable ? (
          <button
            type="button"
            className="nodrag rounded border px-1 text-destructive hover:bg-destructive/10"
            onClick={() => mutate({ op: 'release', id: data.id })}
          >
            release
          </button>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={editable}
        className={editable ? handleClass : '!opacity-0'}
      />
    </div>
  )
}

export function PhaseNode({ data }: NodeProps<PhaseNodeModel>) {
  return (
    <div className="h-full w-full rounded-lg border border-dashed bg-muted/20">
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{data.label}</div>
    </div>
  )
}

export function ArtifactNode({ data }: NodeProps<ArtifactNodeModel>) {
  return (
    <div className="flex h-full w-full items-center gap-1 rounded-md border bg-secondary px-2 text-xs text-secondary-foreground">
      {data.kind === 'file' ? (
        <FileText className="size-3 shrink-0" />
      ) : (
        <Link2 className="size-3 shrink-0" />
      )}
      <span className="truncate">{data.target}</span>
    </div>
  )
}
