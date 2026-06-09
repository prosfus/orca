// The single write path for a canvas file: lock → read fresh → apply a pure delta → atomic
// write (temp + rename). Both the CLI and (later) the Orca UI mutate through here, so
// concurrent writers never clobber and a claim race resolves to exactly one winner.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { withCanvasLock } from './canvas-file-lock'
import { emptyCanvas, type Canvas } from './json-canvas-types'

function normalizeCanvas(value: unknown): Canvas {
  const parsed = (value ?? {}) as Partial<Canvas>
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : []
  }
}

export async function readCanvas(filePath: string): Promise<Canvas> {
  try {
    return normalizeCanvas(JSON.parse(await fs.readFile(filePath, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyCanvas()
    }
    throw error
  }
}

async function writeCanvasAtomic(filePath: string, canvas: Canvas): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(canvas, null, 2)}${os.EOL}`, 'utf8')
  await fs.rename(tmp, filePath)
}

export async function mutateCanvas<T>(
  filePath: string,
  apply: (canvas: Canvas) => { canvas: Canvas; result: T }
): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  return withCanvasLock(filePath, async () => {
    const { canvas, result } = apply(await readCanvas(filePath))
    await writeCanvasAtomic(filePath, canvas)
    return result
  })
}
