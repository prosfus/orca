import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hasCurrentCanvasGuideBlock,
  removeCanvasGuide,
  removeCanvasGuideBlock,
  upsertCanvasGuideBlock,
  writeCanvasGuide
} from './canvas-guide-memory-block'

const BODY = '## Guide\n\nbody line one\nbody line two'
const NEW_BODY = '## Guide\n\nrewritten body'

describe('upsertCanvasGuideBlock', () => {
  it('returns just the wrapped block for an empty file', () => {
    const out = upsertCanvasGuideBlock('', BODY)
    expect(out).toContain('ORCA:CANVAS-GUIDE START')
    expect(out).toContain('ORCA:CANVAS-GUIDE END')
    expect(out).toContain(BODY)
    expect(hasCurrentCanvasGuideBlock(out, BODY)).toBe(true)
  })

  it('is idempotent (second upsert is byte-identical)', () => {
    const once = upsertCanvasGuideBlock('', BODY)
    expect(upsertCanvasGuideBlock(once, BODY)).toBe(once)
  })

  it('appends after user content, preserving it', () => {
    const out = upsertCanvasGuideBlock('# My notes\n\nkeep me', BODY)
    expect(out.startsWith('# My notes\n\nkeep me')).toBe(true)
    expect(out).toContain(BODY)
    // No blank-line accumulation on a repeat.
    expect(upsertCanvasGuideBlock(out, BODY)).toBe(out)
  })

  it('replaces an existing block in place, preserving prose before AND after', () => {
    const seeded = `${upsertCanvasGuideBlock('before text', BODY)}\n\nafter text`
    const out = upsertCanvasGuideBlock(seeded, NEW_BODY)
    expect(out.startsWith('before text')).toBe(true)
    expect(out.endsWith('after text')).toBe(true)
    expect(out).toContain(NEW_BODY)
    expect(out).not.toContain('body line one')
  })
})

describe('removeCanvasGuideBlock', () => {
  it('collapses a block-only file to empty', () => {
    expect(removeCanvasGuideBlock(upsertCanvasGuideBlock('', BODY))).toBe('')
  })

  it('removes the block and its separator, keeping user content', () => {
    const seeded = upsertCanvasGuideBlock('# Notes\n\nkeep me', BODY)
    expect(removeCanvasGuideBlock(seeded)).toBe('# Notes\n\nkeep me\n')
  })

  it('is a no-op when there is no block', () => {
    expect(removeCanvasGuideBlock('# Notes only')).toBe('# Notes only')
  })
})

describe('writeCanvasGuide / removeCanvasGuide', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'orca-canvas-guide-'))
    file = path.join(dir, 'CLAUDE.md')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates the file and any missing parent dirs with the block', () => {
    const nested = path.join(dir, 'a', 'b', 'CLAUDE.md')
    writeCanvasGuide(nested, BODY)
    expect(readFileSync(nested, 'utf-8')).toContain('ORCA:CANVAS-GUIDE START')
  })

  it('does not roll a backup when content is unchanged', () => {
    writeCanvasGuide(file, BODY)
    writeCanvasGuide(file, BODY)
    expect(existsSync(`${file}.bak`)).toBe(false)
  })

  it('rolls a single backup when the block body changes', () => {
    writeCanvasGuide(file, BODY)
    writeCanvasGuide(file, NEW_BODY)
    expect(readFileSync(file, 'utf-8')).toContain(NEW_BODY)
    expect(readFileSync(`${file}.bak`, 'utf-8')).toContain('body line one')
  })

  it('removeCanvasGuide strips the block but keeps user content', () => {
    writeFileSync(file, upsertCanvasGuideBlock('# Notes\n\nkeep me', BODY), 'utf-8')
    removeCanvasGuide(file)
    expect(readFileSync(file, 'utf-8')).toBe('# Notes\n\nkeep me\n')
  })
})
