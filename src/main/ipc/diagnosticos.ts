import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { Diagnostico } from '../../shared/types'

// Why: Trabe diagnosticos are ephemeral launch records persisted in the
// PersistedState JSON, mirroring the AutomationRun IPC surface.
export function registerDiagnosticoHandlers(
  store: Store,
  mainWindow: BrowserWindow | null
): void {
  ipcMain.handle('diagnosticos:list', (): Diagnostico[] => store.listDiagnosticos())
  ipcMain.handle(
    'diagnosticos:get',
    (_event, args: { id: string }): Diagnostico | null => store.getDiagnostico(args.id)
  )
  ipcMain.handle('diagnosticos:delete', (_event, args: { id: string }): void => {
    store.deleteDiagnostico(args.id)
    notifyDiagnosticosChanged(mainWindow)
  })
}

// Exported so the watcher and diagnostic pipeline (other phases) can signal
// the renderer when diagnosticos change outside an IPC round-trip.
export function notifyDiagnosticosChanged(mainWindow: BrowserWindow | null): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('diagnosticos:changed')
  }
}
