// Builds the canvas-related environment injected into an agent's PTY so the standalone
// `orca canvas` CLI can find this workspace's file (ORCA_CANVAS_PATH) and launcher
// (ORCA_CANVAS_BIN). Keyed by instanceId (unique even when workspaces share a directory). If
// the workspace has no instanceId yet, nothing is injected — the CLI just reports no path.

import { homedir } from 'node:os'
import { deriveCanvasPath } from '../../shared/canvas'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree-id'
import { canvasCliBinPath } from './canvas-cli-wrapper'

type CanvasCapableWorktree = { path: string; instanceId?: string }
type WorktreeMetaSource = { getWorktreeMeta?: (id: string) => { instanceId?: string } | undefined }

// The local launcher path (the wrapper installCanvasCliLocal writes). Only valid for local
// panes; remote panes get their bin installed + injected by the SSH session setup.
export function localCanvasBinPath(): string {
  return canvasCliBinPath(homedir(), process.platform)
}

// Runtime spawn sites that already hold a resolved worktree (path + instanceId).
export function canvasPaneEnv(
  worktree: CanvasCapableWorktree,
  opts: { local: boolean } = { local: true }
): Record<string, string> {
  if (!worktree.instanceId) {
    return {}
  }
  const env: Record<string, string> = {
    ORCA_CANVAS_PATH: deriveCanvasPath(worktree.path, worktree.instanceId)
  }
  if (opts.local) {
    env.ORCA_CANVAS_BIN = localCanvasBinPath()
  }
  return env
}

// The IPC spawn site, which holds only a worktree id: recover path from the id and instanceId
// from the store. Returns undefined when either is unknown — the CLI then has no path.
export function canvasPathForWorktreeId(
  store: WorktreeMetaSource | undefined,
  worktreeId: string
): string | undefined {
  // Guard the method's existence, not just `store` being defined: some PTY spawn paths pass a
  // partial store object that has no getWorktreeMeta.
  const instanceId =
    typeof store?.getWorktreeMeta === 'function'
      ? store.getWorktreeMeta(worktreeId)?.instanceId
      : undefined
  const worktreePath = splitWorktreeIdForFilesystem(worktreeId)?.worktreePath
  if (!instanceId || !worktreePath) {
    return undefined
  }
  return deriveCanvasPath(worktreePath, instanceId)
}
