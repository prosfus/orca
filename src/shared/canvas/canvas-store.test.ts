import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTask, listTasks } from './canvas-document'
import { claimTask, createTask } from './canvas-task-mutations'
import { mutateCanvas, readCanvas } from './canvas-store'

let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orca-canvas-'))
  file = path.join(dir, '.orca', 'instance.canvas')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('mutateCanvas', () => {
  it('lazily creates the file on first write', async () => {
    const id = await mutateCanvas(file, (canvas) => {
      const next = createTask(canvas, { title: 'first task' })
      return { canvas: next.canvas, result: next.id }
    })
    expect(id).toBe('first-task')
    expect(getTask(await readCanvas(file), 'first-task')?.title).toBe('first task')
  })

  it('serializes concurrent claims so exactly one wins', async () => {
    await mutateCanvas(file, (canvas) => ({
      canvas: createTask(canvas, { title: 'shared' }).canvas,
      result: undefined
    }))
    const now = Date.parse('2026-06-09T10:00:00Z')

    const attempts = ['paneA', 'paneB', 'paneC'].map((owner) =>
      mutateCanvas(file, (canvas) => ({
        canvas: claimTask(canvas, 'shared', owner, now),
        result: owner
      }))
    )
    const settled = await Promise.allSettled(attempts)

    const winners = settled.filter((outcome) => outcome.status === 'fulfilled')
    expect(winners).toHaveLength(1)
    const finalOwner = getTask(await readCanvas(file), 'shared')?.owner
    expect(finalOwner).toBe((winners[0] as PromiseFulfilledResult<string>).value)
  })

  it('keeps writes from clobbering each other under concurrency', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        mutateCanvas(file, (canvas) => ({
          canvas: createTask(canvas, { title: `task ${index}` }).canvas,
          result: undefined
        }))
      )
    )
    expect(listTasks(await readCanvas(file))).toHaveLength(8)
  })
})
