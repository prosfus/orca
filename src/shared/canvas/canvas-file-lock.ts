// Cross-process advisory lock for a single canvas file, built on atomic `mkdir` (works on
// macOS/Linux/Windows and needs no dependency). A lock left by a crashed writer is broken
// once it is older than the stale window. All writers of a file are co-located on its host's
// local disk (see ADR), so a same-host lock is sufficient — no distributed locking.

import fs from 'node:fs/promises'

const LOCK_SUFFIX = '.lock'
const STALE_LOCK_MS = 30_000
const RETRY_DELAY_MS = 50
const ACQUIRE_TIMEOUT_MS = 10_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isStale(lockDir: string, now: number): Promise<boolean> {
  try {
    const stat = await fs.stat(lockDir)
    return now - stat.mtimeMs >= STALE_LOCK_MS
  } catch {
    return false
  }
}

async function tryAcquireOnce(lockDir: string): Promise<boolean> {
  try {
    await fs.mkdir(lockDir)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
    if (await isStale(lockDir, Date.now())) {
      await fs.rmdir(lockDir).catch(() => undefined)
    }
    return false
  }
}

export async function withCanvasLock<T>(filePath: string, run: () => Promise<T>): Promise<T> {
  const lockDir = `${filePath}${LOCK_SUFFIX}`
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  let acquired = false
  while (Date.now() < deadline) {
    if (await tryAcquireOnce(lockDir)) {
      acquired = true
      break
    }
    await delay(RETRY_DELAY_MS)
  }
  if (!acquired) {
    throw new Error(`Timed out acquiring canvas lock: ${lockDir}`)
  }
  try {
    return await run()
  } finally {
    await fs.rmdir(lockDir).catch(() => undefined)
  }
}
