// A flat, render-ready projection of a canvas, built in the main process and sent to the
// renderer. Type-only imports keep this module free of any node/yaml/zod runtime, so the
// renderer can import it without pulling the node-only engine modules (canvas-store et al.).

import type { CanvasStatus } from './canvas-status'
import type { CanvasPriority } from './canvas-task'

export type CanvasTaskView = {
  id: string
  title: string
  // Free-form description/criteria below the title; surfaced in the task detail dialog.
  body: string
  status: CanvasStatus
  ready: boolean
  owner?: string
  priority?: CanvasPriority
  est?: string
  ref?: string
  x: number
  y: number
  width: number
  height: number
}

export type CanvasPhaseView = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export type CanvasEdgeView = { id: string; fromNode: string; toNode: string }

export type CanvasArtifactView = {
  id: string
  kind: 'file' | 'link'
  target: string
  x: number
  y: number
  width: number
  height: number
}

export type CanvasPlanView = {
  tasks: CanvasTaskView[]
  phases: CanvasPhaseView[]
  edges: CanvasEdgeView[]
  artifacts: CanvasArtifactView[]
}

// The canvas:read IPC result. `exists` is false when the workspace has no canvas file yet;
// `editable` is false when writes are not (yet) supported for this workspace (e.g. a remote
// worktree before the remote write path lands).
export type CanvasReadResult = { exists: boolean; editable: boolean; plan: CanvasPlanView | null }
