// Reads a workspace's .canvas file (local or over SSH) and projects it to the render-ready
// CanvasPlanView. The path is DERIVED from the worktree id by main (never supplied by the
// renderer), so it is trusted — no path authorization needed. Read-only: writes never go here.

import { readFile } from 'node:fs/promises'
import {
  applyMutation,
  mutationToArgv,
  type CanvasMutation
} from '../../shared/canvas/canvas-mutation'
import { buildPlanView } from '../../shared/canvas/canvas-plan-view-builder'
import type { CanvasReadResult } from '../../shared/canvas/canvas-plan-view'
import { mutateCanvas } from '../../shared/canvas/canvas-store'
import type { Canvas } from '../../shared/canvas/json-canvas-types'
import { splitWorktreeId } from '../../shared/worktree-id'
import { getActiveSshRelaySession } from '../ipc/ssh'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { canvasPathForWorktreeId } from './canvas-pane-env'

export type { CanvasReadResult }

type CanvasReadStore = {
  getWorktreeMeta?: (id: string) => { instanceId?: string } | undefined
  getRepo?: (id: string) => { connectionId?: string | null } | undefined
}

function resolveConnectionId(store: CanvasReadStore, worktreeId: string): string | undefined {
  const parsed = splitWorktreeId(worktreeId)
  const connectionId = parsed && store.getRepo?.(parsed.repoId)?.connectionId
  return connectionId ?? undefined
}

function parseCanvas(raw: string): Canvas {
  const value = JSON.parse(raw) as Partial<Canvas>
  return {
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    edges: Array.isArray(value.edges) ? value.edges : []
  }
}

async function readRaw(filePath: string, connectionId: string | undefined): Promise<string | null> {
  try {
    if (connectionId) {
      return (await requireSshFilesystemProvider(connectionId).readFile(filePath)).content
    }
    return await readFile(filePath, 'utf8')
  } catch (error) {
    // A missing file is the normal "no canvas yet" case; anything else, treat the same here but
    // surface it in the log so a real read problem is visible.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[canvas] read failed:', error)
    }
    return null
  }
}

export async function readCanvasPlan(
  store: CanvasReadStore,
  worktreeId: string
): Promise<CanvasReadResult> {
  const filePath = canvasPathForWorktreeId(store, worktreeId)
  const connectionId = resolveConnectionId(store, worktreeId)
  // Editing a remote canvas (over the relay CLI) is Milestone 3 step 7; until then, remote is
  // view-only — local writes go straight through the in-process locked store.
  const editable = !connectionId
  if (!filePath) {
    return { exists: false, editable, plan: null }
  }
  const raw = await readRaw(filePath, connectionId)
  if (raw === null) {
    return { exists: false, editable, plan: null }
  }
  return { exists: true, editable, plan: buildPlanView(parseCanvas(raw)) }
}

// Applies one editor mutation. Local worktrees go through the in-process locked store (same lock
// a local agent's CLI takes). Remote worktrees run the remote `orca-canvas` CLI — wired in step 7.
export async function writeCanvasMutation(
  store: CanvasReadStore,
  worktreeId: string,
  mutation: CanvasMutation
): Promise<CanvasReadResult> {
  const filePath = canvasPathForWorktreeId(store, worktreeId)
  if (!filePath) {
    throw new Error('This workspace has no canvas path (missing instanceId)')
  }
  const connectionId = resolveConnectionId(store, worktreeId)
  if (connectionId) {
    // Remote: run the write on the remote host so its CLI takes the remote-local lock — Orca
    // never writes the remote file across the wire (preserves the ADR lock invariant).
    const session = getActiveSshRelaySession(connectionId)
    if (!session) {
      throw new Error('Remote workspace is not connected')
    }
    await session.runRemoteCanvasCli([...mutationToArgv(mutation), '--file', filePath, '--json'])
  } else {
    await mutateCanvas(filePath, (canvas) => ({
      canvas: applyMutation(canvas, mutation),
      result: undefined
    }))
  }
  return readCanvasPlan(store, worktreeId)
}
