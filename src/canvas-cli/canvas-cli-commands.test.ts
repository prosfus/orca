import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCanvasArgs } from './canvas-cli-args'
import { runCommand, type CommandContext } from './canvas-cli-commands'

const NOW = Date.parse('2026-06-09T10:00:00Z')
let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orca-canvas-cli-'))
  file = path.join(dir, '.orca', 'instance.canvas')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

function run(argv: string[], owner?: string): Promise<{ human: string; json: unknown }> {
  const { positionals, flags } = parseCanvasArgs(argv)
  const ctx: CommandContext = {
    file,
    positionals: positionals.slice(1),
    flags,
    owner,
    now: NOW
  }
  return runCommand(positionals[0], ctx)
}

describe('canvas CLI commands', () => {
  it('adds, lists, claims and shows a task end to end', async () => {
    const created = await run(['add-task', 'Implementar login', '--priority', 'high'])
    expect(created.json).toEqual({ id: 'implementar-login' })

    const claimed = await run(['claim', 'implementar-login'], 'paneA')
    expect(claimed.json).toEqual({ id: 'implementar-login', owner: 'paneA' })

    const shown = await run(['show', 'implementar-login'])
    expect((shown.json as { task: { status: string; owner: string } }).task).toMatchObject({
      status: 'in-progress',
      owner: 'paneA'
    })
  })

  it('derives readiness from dependencies for `next`', async () => {
    await run(['add-task', 'setup'])
    await run(['add-task', 'login', '--after', 'setup'])

    const blocked = await run(['next'])
    expect((blocked.json as { task: { id: string } | null }).task?.id).toBe('setup')

    await run(['set-status', 'setup', 'done'])
    const unblocked = await run(['next'])
    expect((unblocked.json as { task: { id: string } | null }).task?.id).toBe('login')
  })

  it('refuses a claim with no owner and a live double claim', async () => {
    await run(['add-task', 'x'])
    await expect(run(['claim', 'x'])).rejects.toThrow(/owner/)
    await run(['claim', 'x'], 'paneA')
    await expect(run(['claim', 'x'], 'paneB')).rejects.toThrow(/already claimed/)
  })

  it('removes a task only with --force when it has dependents', async () => {
    await run(['add-task', 'setup'])
    await run(['add-task', 'login', '--after', 'setup'])
    await expect(run(['remove-task', 'setup'])).rejects.toThrow(/dependents/)
    const removed = await run(['remove-task', 'setup', '--force'])
    expect(removed.json).toEqual({ id: 'setup' })
  })
})
