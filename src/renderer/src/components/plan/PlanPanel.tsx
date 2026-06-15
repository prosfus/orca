// Live, read-only board for the global Orchestration plan. Polls the projected
// PlanView from main and renders it as a kanban of phases (each an assigned
// agent's column). The graph view, "Start" action, and editing land in later
// phases; this is the viewer.

import { useEffect, useRef, useState } from 'react'
import type { PlanReadResult, PlanTaskView } from '../../../../shared/plan/plan-view'
import { PlanBoardView } from './PlanBoardView'
import { PlanTaskDetail } from './PlanTaskDetail'

const POLL_MS = 1500

const EMPTY: PlanReadResult = { exists: false, plan: { phases: [], tasks: [] } }

export default function PlanPanel() {
  const [state, setState] = useState<PlanReadResult>(EMPTY)
  const lastSerialized = useRef('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      const result = await window.api.plan.read()
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
    // Why: the orchestration DAG changes as the coordinator dispatches work;
    // poll for now (cheap), like the Canvas board. Event-push is a follow-up.
    const interval = window.setInterval(() => void load(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  if (!state.exists) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <span>No plan yet.</span>
        <span className="text-[12px]">
          Create phases and tasks with <code className="mx-1">orca orchestration</code>, or generate
          a plan from a prompt.
        </span>
      </div>
    )
  }

  const phaseCount = state.plan.phases.length
  const taskCount = state.plan.tasks.length
  const selectedTask: PlanTaskView | null =
    state.plan.tasks.find((task) => task.id === selectedTaskId) ?? null

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">Plan</span>
          <span className="text-[11px] text-muted-foreground">
            {phaseCount} {phaseCount === 1 ? 'phase' : 'phases'} · {taskCount}{' '}
            {taskCount === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PlanBoardView
            plan={state.plan}
            selectedTaskId={selectedTaskId}
            onSelectTask={(task) => setSelectedTaskId(task.id)}
          />
        </div>
        {selectedTask ? (
          <PlanTaskDetail task={selectedTask} onClose={() => setSelectedTaskId(null)} />
        ) : null}
      </div>
    </div>
  )
}
