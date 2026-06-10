// Pure helpers for the `orca canvas` launcher: the wrapper-script content and its install
// path. The wrapper just execs `node <bundle>` so agents get a single command. Kept
// electron-free so it is unit-testable; the install I/O lives in canvas-cli-installer.ts.

import path from 'node:path'

export function posixWrapperContent(bundlePath: string): string {
  return `#!/bin/sh\nexec node "${bundlePath}" "$@"\n`
}

export function windowsWrapperContent(bundlePath: string): string {
  return `@echo off\r\nnode "${bundlePath}" %*\r\n`
}

export function canvasCliWrapperContent(bundlePath: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? windowsWrapperContent(bundlePath) : posixWrapperContent(bundlePath)
}

// Why: name the POSIX launcher `orca-canvas` (no extension) so a single
// `orca-canvas` invocation resolves on PATH locally and remotely (the remote
// bin is also `orca-canvas`). Windows keeps `.cmd` — invocable as `orca-canvas`
// via PATHEXT.
export function canvasCliBinPath(home: string, platform: NodeJS.Platform): string {
  const name = platform === 'win32' ? 'orca-canvas.cmd' : 'orca-canvas'
  return path.join(home, '.orca', 'canvas', name)
}
