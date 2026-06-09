// Installs the standalone `orca canvas` launcher so agents can run it. Reuses the agent-hooks
// managed-script primitive (atomic write + exec bit) but is a SEPARATE install path: the canvas
// CLI is not a status hook and must not be gated by the agent-status-hooks toggle.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { writeManagedScript } from '../agent-hooks/installer-utils'
import { canvasCliBinPath, canvasCliWrapperContent } from './canvas-cli-wrapper'

// The bundle lives under out/canvas-cli. In a packaged app it must be asar-unpacked
// (electron-builder `asarUnpack`) so a child `node` process can execute a real file.
export function canvasCliBundlePath(): string {
  const root = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked')
  return path.join(root, 'out', 'canvas-cli', 'orca-canvas.cjs')
}

export function localCanvasCliBinPath(): string {
  return canvasCliBinPath(homedir(), process.platform)
}

// Writes the wrapper at ~/.orca/canvas and returns its path (use as ORCA_CANVAS_BIN). Safe to
// call repeatedly; writeManagedScript is a no-op when the content is unchanged.
export function installCanvasCliLocal(): string {
  const binPath = localCanvasCliBinPath()
  writeManagedScript(binPath, canvasCliWrapperContent(canvasCliBundlePath(), process.platform))
  return binPath
}

// The bundle's bytes, for pushing to a remote host over SFTP (see ssh-relay-session).
export function readCanvasCliBundle(): string {
  return readFileSync(canvasCliBundlePath(), 'utf8')
}
