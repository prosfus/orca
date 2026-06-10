// IPC for the Canvas (Milestone 2 read + Milestone 3 write). The renderer asks for a worktree's
// plan and applies editor mutations; main derives the path, reads/writes (local now, SSH in M3
// step 7), and returns the fresh projection. Live read updates reuse the M2 polling on the
// renderer side.

import { ipcMain } from 'electron'
import type { CanvasMutation } from '../../shared/canvas/canvas-mutation'
import {
  readCanvasPlan,
  writeCanvasMutation,
  type CanvasReadResult
} from '../canvas/canvas-plan-source'
import type { Store } from '../persistence'

export function registerCanvasHandlers(store: Store): void {
  ipcMain.handle(
    'canvas:read',
    (_event, args: { worktreeId: string }): Promise<CanvasReadResult> =>
      readCanvasPlan(store, args.worktreeId)
  )
  ipcMain.handle(
    'canvas:mutate',
    (_event, args: { worktreeId: string; mutation: CanvasMutation }): Promise<CanvasReadResult> =>
      writeCanvasMutation(store, args.worktreeId, args.mutation)
  )
}
