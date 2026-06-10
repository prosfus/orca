// Inserts/updates/removes the managed Canvas-guide block inside an agent's global
// markdown memory file (CLAUDE.md / AGENTS.md / GEMINI.md), preserving everything
// the user wrote outside the markers. HTML-comment markers survive every markdown
// renderer and never collide with prose. The block body comes from
// canvas-guide-text.ts; the atomic write + rolling .bak is the shared helper.

import { existsSync, readFileSync } from 'node:fs'
import { writeTextFileAtomicWithBackup } from '../agent-hooks/installer-utils'

const BLOCK_START = '<!-- ORCA:CANVAS-GUIDE START (managed by Orca - edits will be overwritten) -->'
const BLOCK_END = '<!-- ORCA:CANVAS-GUIDE END -->'

// Why: match any START variant (so a reworded marker line is still recognized)
// and any leading blank lines, so repeated upsert/remove cycles never accumulate
// blank separators. No `g` flag: there is exactly one managed block.
const BLOCK_PATTERN = /\n*<!-- ORCA:CANVAS-GUIDE START[\s\S]*?<!-- ORCA:CANVAS-GUIDE END -->/

function wrapBlock(body: string): string {
  return `${BLOCK_START}\n${body}\n${BLOCK_END}`
}

export function hasCurrentCanvasGuideBlock(existing: string, body: string): boolean {
  return existing.includes(wrapBlock(body))
}

// Missing/blank → just the block; existing block → replaced in place (keeping the
// same leading separator); user content but no block → appended after one blank
// line. Idempotent: a second upsert with the same body returns byte-identical text.
export function upsertCanvasGuideBlock(existing: string, body: string): string {
  const block = wrapBlock(body)
  const current = existing ?? ''
  if (BLOCK_PATTERN.test(current)) {
    return current.replace(BLOCK_PATTERN, (match) => {
      const leadingNewlines = /^\n*/.exec(match)?.[0] ?? ''
      return `${leadingNewlines}${block}`
    })
  }
  if (current.trim().length === 0) {
    return `${block}\n`
  }
  return `${current.replace(/\n+$/, '')}\n\n${block}\n`
}

// Removes the block and its leading separator. Collapses a file that held only
// the block to empty; otherwise preserves the user's content untouched.
export function removeCanvasGuideBlock(existing: string): string {
  const current = existing ?? ''
  if (!BLOCK_PATTERN.test(current)) {
    return current
  }
  const removed = current.replace(BLOCK_PATTERN, '')
  return removed.trim().length === 0 ? '' : removed
}

export function writeCanvasGuide(memoryFilePath: string, body: string): void {
  const existing = existsSync(memoryFilePath) ? readFileSync(memoryFilePath, 'utf-8') : ''
  writeTextFileAtomicWithBackup(memoryFilePath, upsertCanvasGuideBlock(existing, body))
}

export function removeCanvasGuide(memoryFilePath: string): void {
  if (!existsSync(memoryFilePath)) {
    return
  }
  const existing = readFileSync(memoryFilePath, 'utf-8')
  // writeTextFileAtomicWithBackup is a no-op when the content is unchanged, so a
  // file with no managed block won't be rewritten (and its .bak won't roll).
  writeTextFileAtomicWithBackup(memoryFilePath, removeCanvasGuideBlock(existing))
}
