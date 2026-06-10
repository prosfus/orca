// Live, editable board for a workspace's Canvas plan. Reads the projected plan from main (polled),
// renders it with react-flow, and turns interactions into mutations via useCanvasEditing. Remote
// worktrees are view-only (`editable` false) until the Milestone 3 remote write path lands.

import { Background, Controls, MarkerType, ReactFlow, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './react-flow-theme.css'
import { LayoutGrid, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CanvasReadResult } from '../../../../shared/canvas/canvas-plan-view'
import { CanvasEditProvider } from './canvas-edit-context'
import { ArtifactNode, PhaseNode, TaskNode } from './canvas-nodes'
import { CanvasTaskDialog } from './CanvasTaskDialog'
import { computeTidyLayout } from './canvas-tidy-layout'
import { useCanvasEditing } from './useCanvasEditing'
import { useStaleClaim } from './useStaleClaim'

const POLL_MS = 1500

export default function CanvasPanel({ worktreeId }: { worktreeId: string }) {
  const [state, setState] = useState<CanvasReadResult>({
    exists: false,
    editable: false,
    plan: null
  })
  const lastSerialized = useRef('')

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      const result = await window.api.canvas.read({ worktreeId })
      if (!active) {
        return
      }
      const serialized = JSON.stringify(result)
      if (serialized !== lastSerialized.current) {
        lastSerialized.current = serialized
        setState(result)
      }
    }
    void load()
    // Why: the .canvas lives under gitignored .orca/, which the worktree file-watcher may skip,
    // so poll rather than rely on fs:changed. Cheap (small file); instant-watch is a follow-up.
    const interval = window.setInterval(() => void load(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [worktreeId])

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const editing = useCanvasEditing(worktreeId, state.plan, state.editable)
  const isStale = useStaleClaim(worktreeId)
  const nodeTypes = useMemo<NodeTypes>(
    () => ({ task: TaskNode, phase: PhaseNode, artifact: ArtifactNode }),
    []
  )
  const editApi = useMemo(
    () => ({ editable: state.editable, mutate: editing.mutate, isStale, openTask: setOpenTaskId }),
    [state.editable, editing.mutate, isStale]
  )

  const openTask = state.plan?.tasks.find((task) => task.id === openTaskId) ?? null

  // Tidy overwrites every manual position with a dependency-depth layout, so confirm first.
  const tidy = (): void => {
    if (state.plan && window.confirm('Re-arrange all tasks by dependency order?')) {
      for (const node of computeTidyLayout(state.plan)) {
        editing.mutate({ op: 'setPosition', id: node.id, x: node.x, y: node.y })
      }
    }
  }

  if (!state.exists || !state.plan) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <span>
          No canvas yet. An agent or the <code className="mx-1">orca canvas</code> CLI will create
          one.
        </span>
        {state.editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => editing.mutate({ op: 'createTask', title: 'New task' })}
          >
            <Plus className="size-4" /> Create first task
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <CanvasEditProvider value={editApi}>
      <div className="canvas-board relative h-full w-full">
        {state.editable ? (
          <div className="absolute left-2 top-2 z-10 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => editing.mutate({ op: 'createTask', title: 'New task' })}
            >
              <Plus className="size-4" /> Add task
            </Button>
            <Button size="sm" variant="outline" onClick={tidy}>
              <LayoutGrid className="size-4" /> Tidy
            </Button>
          </div>
        ) : null}
        <ReactFlow
          nodes={editing.nodes}
          edges={editing.edges}
          nodeTypes={nodeTypes}
          onNodesChange={editing.onNodesChange}
          onEdgesChange={editing.onEdgesChange}
          onConnect={editing.onConnect}
          onNodeDragStart={editing.onNodeDragStart}
          onNodeDragStop={editing.onNodeDragStop}
          onEdgesDelete={editing.onEdgesDelete}
          onNodesDelete={editing.onNodesDelete}
          fitView
          nodesDraggable={state.editable}
          nodesConnectable={state.editable}
          elementsSelectable={state.editable}
          deleteKeyCode={state.editable ? ['Delete', 'Backspace'] : null}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
        {openTask ? (
          <CanvasTaskDialog
            key={openTask.id}
            task={openTask}
            editable={state.editable}
            ownerStale={isStale(openTask.owner)}
            mutate={editing.mutate}
            onClose={() => setOpenTaskId(null)}
          />
        ) : null}
      </div>
    </CanvasEditProvider>
  )
}
