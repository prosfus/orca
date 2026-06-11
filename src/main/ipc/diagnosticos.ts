import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { Diagnostico } from '../../shared/types'

// Why: Trabe diagnosticos are ephemeral launch records persisted in the
// PersistedState JSON, mirroring the AutomationRun IPC surface.
export function registerDiagnosticoHandlers(store: Store, mainWindow: BrowserWindow | null): void {
  ipcMain.handle('diagnosticos:list', (): Diagnostico[] => store.listDiagnosticos())
  ipcMain.handle('diagnosticos:get', (_event, args: { id: string }): Diagnostico | null =>
    store.getDiagnostico(args.id)
  )
  ipcMain.handle(
    'diagnosticos:update',
    (_event, args: { id: string; patch: Partial<Omit<Diagnostico, 'id'>> }): Diagnostico | null => {
      const updated = store.updateDiagnostico(args.id, args.patch)
      notifyDiagnosticosChanged(mainWindow)
      return updated
    }
  )
  ipcMain.handle('diagnosticos:delete', (_event, args: { id: string }): void => {
    store.deleteDiagnostico(args.id)
    notifyDiagnosticosChanged(mainWindow)
  })
  // Stamp the diagnostic worktree's lineage origin so it stays hidden from the
  // Workspaces list (visible-worktrees filters origin === 'incidencia').
  ipcMain.handle('diagnosticos:adoptWorktree', (_event, args: { worktreeId: string }): void => {
    const existing = store.getWorktreeLineage(args.worktreeId)
    if (!existing) {
      return
    }
    store.setWorktreeLineage(args.worktreeId, { ...existing, origin: 'incidencia' })
  })
}

// Exported so the watcher and diagnostic pipeline (other phases) can signal
// the renderer when diagnosticos change outside an IPC round-trip.
export function notifyDiagnosticosChanged(mainWindow: BrowserWindow | null): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('diagnosticos:changed')
  }
}
