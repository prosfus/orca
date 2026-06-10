import { describe, expect, it } from 'vitest'
import { canvasPaneEnv, canvasPathForWorktreeId } from './canvas-pane-env'

describe('canvasPaneEnv', () => {
  it('derives ORCA_CANVAS_PATH for a remote pane (path only, POSIX separators)', () => {
    expect(canvasPaneEnv({ path: '/home/dev/proj', instanceId: 'abc' }, { local: false })).toEqual({
      ORCA_CANVAS_PATH: '/home/dev/proj/.orca/abc.canvas'
    })
  })

  it('adds ORCA_CANVAS_BIN for a local pane', () => {
    const env = canvasPaneEnv({ path: '/home/dev/proj', instanceId: 'abc' }, { local: true })
    expect(env.ORCA_CANVAS_PATH).toBe('/home/dev/proj/.orca/abc.canvas')
    expect(env.ORCA_CANVAS_BIN).toMatch(/orca-canvas(\.cmd)?$/)
  })

  it('injects nothing when the workspace has no instanceId', () => {
    expect(canvasPaneEnv({ path: '/home/dev/proj' }, { local: true })).toEqual({})
  })
})

describe('canvasPathForWorktreeId', () => {
  const store = { getWorktreeMeta: () => ({ instanceId: 'abc' }) }

  it('recovers the path from the worktree id and the instanceId from the store', () => {
    expect(canvasPathForWorktreeId(store, 'repo1::/home/dev/proj')).toBe(
      '/home/dev/proj/.orca/abc.canvas'
    )
  })

  it('returns undefined when the store has no instanceId', () => {
    expect(canvasPathForWorktreeId(undefined, 'repo1::/home/dev/proj')).toBeUndefined()
    expect(
      canvasPathForWorktreeId({ getWorktreeMeta: () => undefined }, 'repo1::/home/dev/proj')
    ).toBeUndefined()
  })

  it('tolerates a partial store object with no getWorktreeMeta method', () => {
    expect(canvasPathForWorktreeId({}, 'repo1::/home/dev/proj')).toBeUndefined()
  })
})
