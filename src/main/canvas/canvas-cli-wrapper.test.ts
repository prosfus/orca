import { describe, expect, it } from 'vitest'
import { canvasCliBinPath, canvasCliWrapperContent } from './canvas-cli-wrapper'

describe('canvasCliWrapperContent', () => {
  it('execs node on the bundle for POSIX', () => {
    const content = canvasCliWrapperContent('/opt/orca/out/canvas-cli/orca-canvas.cjs', 'linux')
    expect(content.startsWith('#!/bin/sh')).toBe(true)
    expect(content).toContain('exec node "/opt/orca/out/canvas-cli/orca-canvas.cjs" "$@"')
  })

  it('calls node on the bundle for Windows', () => {
    const content = canvasCliWrapperContent('C:\\orca\\out\\canvas-cli\\orca-canvas.cjs', 'win32')
    expect(content).toContain('node "C:\\orca\\out\\canvas-cli\\orca-canvas.cjs" %*')
  })
})

describe('canvasCliBinPath', () => {
  it('uses a platform-appropriate launcher name under ~/.orca/canvas', () => {
    expect(canvasCliBinPath('/home/dev', 'linux').replace(/\\/g, '/')).toBe(
      '/home/dev/.orca/canvas/orca-canvas.sh'
    )
    expect(canvasCliBinPath('C:\\Users\\Pau', 'win32').replace(/\\/g, '/')).toBe(
      'C:/Users/Pau/.orca/canvas/orca-canvas.cmd'
    )
  })
})
