// Shares the "apply a mutation" callback + editability with the react-flow node components, which
// can't otherwise reach the panel's handlers. The status-cycle helper is pure (unit-tested).

import { createContext, useContext } from 'react'
import type { CanvasMutation } from '../../../../shared/canvas/canvas-mutation'
import type { CanvasStatus } from '../../../../shared/canvas/canvas-status'

export type CanvasEditApi = {
  editable: boolean
  mutate: (mutation: CanvasMutation) => void
  isStale: (owner: string | undefined) => boolean
  // Opens the task detail dialog (owned by the panel) for the given task id.
  openTask: (id: string) => void
}

const CanvasEditContext = createContext<CanvasEditApi>({
  editable: false,
  mutate: () => undefined,
  isStale: () => false,
  openTask: () => undefined
})

export const CanvasEditProvider = CanvasEditContext.Provider

export function useCanvasEdit(): CanvasEditApi {
  return useContext(CanvasEditContext)
}

const STATUS_CYCLE: CanvasStatus[] = ['todo', 'in-progress', 'done']

// Clicking a task's status dot rotates todo → in-progress → done → todo. An off-cycle status
// (blocked) advances to in-progress. (blocked itself is set by agents / the CLI.)
export function nextStatus(status: CanvasStatus): CanvasStatus {
  const index = STATUS_CYCLE.indexOf(status)
  return index === -1 ? 'in-progress' : STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length]
}
