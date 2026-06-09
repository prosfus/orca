// The canvas CLI command surface. Write commands mutate through the single locked store;
// read commands project the file. Owner identity comes from ORCA_PANE_KEY (the agent's pane).

import {
  claimTask,
  createTask,
  createPhase,
  dependentIdsOf,
  getTask,
  isCanvasStatus,
  isTaskReady,
  linkDependency,
  listTasks,
  mutateCanvas,
  prerequisiteIdsOf,
  readCanvas,
  releaseTask,
  removeTask,
  selectNextTask,
  setTaskFields,
  setTaskStatus,
  taskInPhase,
  unlinkDependency,
  type CreateTaskInput
} from '../shared/canvas'
import { flagBool, flagString } from './canvas-cli-args'
import {
  formatTaskOneLine,
  parseList,
  parsePriority,
  statusBadge,
  type CommandResult
} from './canvas-cli-format'

export type CommandContext = {
  file: string
  positionals: string[]
  flags: Map<string, string | boolean>
  owner: string | undefined
  now: number
}

function requireArg(ctx: CommandContext, index: number, name: string): string {
  const value = ctx.positionals[index]
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing <${name}>`)
  }
  return value
}

async function addTask(ctx: CommandContext): Promise<CommandResult> {
  const input: CreateTaskInput = {
    title: requireArg(ctx, 0, 'title'),
    body: flagString(ctx.flags, 'desc'),
    afterIds: parseList(flagString(ctx.flags, 'after')),
    phase: flagString(ctx.flags, 'phase'),
    priority: parsePriority(flagString(ctx.flags, 'priority')),
    est: flagString(ctx.flags, 'est'),
    ref: flagString(ctx.flags, 'ref')
  }
  const id = await mutateCanvas(ctx.file, (canvas) => {
    const next = createTask(canvas, input)
    return { canvas: next.canvas, result: next.id }
  })
  return { human: `created ${id}`, json: { id } }
}

async function setFields(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: setTaskFields(canvas, id, {
      title: flagString(ctx.flags, 'title'),
      body: flagString(ctx.flags, 'desc'),
      priority: parsePriority(flagString(ctx.flags, 'priority')),
      est: flagString(ctx.flags, 'est'),
      ref: flagString(ctx.flags, 'ref')
    }),
    result: undefined
  }))
  return { human: `updated ${id}`, json: { id } }
}

async function setStatus(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  const status = requireArg(ctx, 1, 'status')
  if (!isCanvasStatus(status)) {
    throw new Error(`Invalid status "${status}" (todo | in-progress | blocked | done)`)
  }
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: setTaskStatus(canvas, id, status),
    result: undefined
  }))
  return { human: `${id} -> ${status}`, json: { id, status } }
}

async function link(ctx: CommandContext): Promise<CommandResult> {
  const from = requireArg(ctx, 0, 'prerequisiteId')
  const to = requireArg(ctx, 1, 'dependentId')
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: linkDependency(canvas, from, to),
    result: undefined
  }))
  return { human: `${from} -> ${to}`, json: { from, to } }
}

async function unlink(ctx: CommandContext): Promise<CommandResult> {
  const from = requireArg(ctx, 0, 'prerequisiteId')
  const to = requireArg(ctx, 1, 'dependentId')
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: unlinkDependency(canvas, from, to),
    result: undefined
  }))
  return { human: `unlinked ${from} -> ${to}`, json: { from, to } }
}

async function addPhase(ctx: CommandContext): Promise<CommandResult> {
  const label = requireArg(ctx, 0, 'label')
  const id = await mutateCanvas(ctx.file, (canvas) => {
    const next = createPhase(canvas, label)
    return { canvas: next.canvas, result: next.id }
  })
  return { human: `created phase ${id}`, json: { id, label } }
}

async function claim(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  const owner = ctx.owner
  if (!owner) {
    throw new Error(
      'claim needs an owner: run inside an Orca agent pane (ORCA_PANE_KEY) or pass --owner'
    )
  }
  const steal = flagBool(ctx.flags, 'steal')
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: claimTask(canvas, id, owner, ctx.now, { steal }),
    result: undefined
  }))
  return { human: `claimed ${id} (owner ${owner})`, json: { id, owner } }
}

async function release(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  await mutateCanvas(ctx.file, (canvas) => ({ canvas: releaseTask(canvas, id), result: undefined }))
  return { human: `released ${id}`, json: { id } }
}

async function removeTaskCommand(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  const force = flagBool(ctx.flags, 'force')
  await mutateCanvas(ctx.file, (canvas) => ({
    canvas: removeTask(canvas, id, { force }),
    result: undefined
  }))
  return { human: `removed ${id}`, json: { id } }
}

async function next(ctx: CommandContext): Promise<CommandResult> {
  const canvas = await readCanvas(ctx.file)
  const task = selectNextTask(canvas, { phase: flagString(ctx.flags, 'phase') }, ctx.now)
  if (!task) {
    return { human: 'no ready task', json: { task: null } }
  }
  return { human: formatTaskOneLine(task, true), json: { task } }
}

async function list(ctx: CommandContext): Promise<CommandResult> {
  const canvas = await readCanvas(ctx.file)
  const phase = flagString(ctx.flags, 'phase')
  const onlyReady = flagBool(ctx.flags, 'ready')
  const onlyMine = flagBool(ctx.flags, 'mine')
  const tasks = listTasks(canvas).filter((task) => {
    if (onlyReady && !(task.status === 'todo' && isTaskReady(canvas, task.id))) {
      return false
    }
    if (onlyMine && task.owner !== ctx.owner) {
      return false
    }
    if (phase && !taskInPhase(canvas, task.id, phase)) {
      return false
    }
    return true
  })
  const human =
    tasks.length > 0
      ? tasks.map((task) => formatTaskOneLine(task, isTaskReady(canvas, task.id))).join('\n')
      : '(no tasks)'
  return { human, json: { tasks } }
}

async function show(ctx: CommandContext): Promise<CommandResult> {
  const id = requireArg(ctx, 0, 'id')
  const canvas = await readCanvas(ctx.file)
  const task = getTask(canvas, id)
  if (!task) {
    throw new Error(`No Canvas task with id "${id}"`)
  }
  const prereqs = prerequisiteIdsOf(canvas, id)
  const dependents = dependentIdsOf(canvas, id)
  const ready = isTaskReady(canvas, id)
  const lines = [
    `${task.id}  [${statusBadge(task)}]${ready ? ' (ready)' : ''}`,
    `title: ${task.title}`,
    task.priority ? `priority: ${task.priority}` : null,
    task.est ? `est: ${task.est}` : null,
    task.ref ? `ref: ${task.ref}` : null,
    prereqs.length > 0 ? `after: ${prereqs.join(', ')}` : null,
    dependents.length > 0 ? `blocks: ${dependents.join(', ')}` : null,
    task.body ? `\n${task.body}` : null
  ].filter((line): line is string => line !== null)
  return { human: lines.join('\n'), json: { task, prereqs, dependents, ready } }
}

export async function runCommand(command: string, ctx: CommandContext): Promise<CommandResult> {
  switch (command) {
    case 'add-task':
      return addTask(ctx)
    case 'set':
      return setFields(ctx)
    case 'set-status':
      return setStatus(ctx)
    case 'link':
      return link(ctx)
    case 'unlink':
      return unlink(ctx)
    case 'add-phase':
      return addPhase(ctx)
    case 'claim':
      return claim(ctx)
    case 'release':
      return release(ctx)
    case 'remove-task':
      return removeTaskCommand(ctx)
    case 'next':
      return next(ctx)
    case 'list':
      return list(ctx)
    case 'show':
      return show(ctx)
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}
