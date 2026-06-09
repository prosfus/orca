// Where a workspace's canvas lives: `.orca/<instanceId>.canvas` inside the worktree. Keyed by
// instanceId (not path) so it stays unique even when several workspaces share one directory.
// `.orca/` is gitignored by Orca's worktree setup, so the plan never causes git conflicts.

import path from 'node:path'

export const CANVAS_DIR = '.orca'

// Joined with POSIX separators on purpose: the Orca main process (possibly on Windows) may
// derive the path for a REMOTE POSIX worktree over SSH, and forward slashes are valid for
// node fs on Windows too — so one form works on every host the CLI might run on.
export function deriveCanvasPath(worktreePath: string, instanceId: string): string {
  return path.posix.join(worktreePath, CANVAS_DIR, `${instanceId}.canvas`)
}
