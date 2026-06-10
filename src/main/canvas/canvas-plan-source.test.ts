import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveCanvasPath } from '../../shared/canvas/canvas-path'
import { mutateCanvas } from '../../shared/canvas/canvas-store'
import { createTask } from '../../shared/canvas/canvas-task-mutations'
import { readCanvasPlan, writeCanvasMutation } from './canvas-plan-source'

let dir: string
let worktreeId: string
const store = { getWorktreeMeta: () => ({ instanceId: 'inst' }), getRepo: () => undefined }

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orca-canvas-read-'))
  worktreeId = `repo1::${dir}`
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('readCanvasPlan', () => {
  it('reads and projects a local canvas', async () => {
    const file = deriveCanvasPath(dir, 'inst')
    await mutateCanvas(file, (canvas) => ({
      canvas: createTask(canvas, { title: 'login' }).canvas,
      result: undefined
    }))
    const result = await readCanvasPlan(store, worktreeId)
    expect(result.exists).toBe(true)
    expect(result.plan?.tasks.map((task) => task.id)).toEqual(['login'])
  })

  it('reports not-exists when the file is absent', async () => {
    expect(await readCanvasPlan(store, worktreeId)).toEqual({
      exists: false,
      editable: true,
      plan: null
    })
  })

  it('reports not-exists when the workspace has no instanceId', async () => {
    const noInstance = { getWorktreeMeta: () => undefined, getRepo: () => undefined }
    expect(await readCanvasPlan(noInstance, worktreeId)).toEqual({
      exists: false,
      editable: true,
      plan: null
    })
  })
})

describe('writeCanvasMutation', () => {
  it('applies a mutation and returns the fresh plan', async () => {
    await writeCanvasMutation(store, worktreeId, { op: 'createTask', title: 'login' })
    const after = await writeCanvasMutation(store, worktreeId, {
      op: 'setStatus',
      id: 'login',
      status: 'done'
    })
    expect(after.exists).toBe(true)
    expect(after.plan?.tasks.find((task) => task.id === 'login')?.status).toBe('done')
  })

  it('routes a remote worktree through the relay session (errors when not connected)', async () => {
    const remote = {
      getWorktreeMeta: () => ({ instanceId: 'inst' }),
      getRepo: () => ({ connectionId: 'ssh-not-connected' })
    }
    await expect(
      writeCanvasMutation(remote, worktreeId, { op: 'createTask', title: 'x' })
    ).rejects.toThrow(/not connected/i)
  })
})
