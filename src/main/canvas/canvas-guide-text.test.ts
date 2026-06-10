import { describe, expect, it } from 'vitest'
import { canvasGuideBody } from './canvas-guide-text'

describe('canvasGuideBody', () => {
  const body = canvasGuideBody()

  it('is self-conditional on ORCA_CANVAS_PATH', () => {
    expect(body).toContain('ORCA_CANVAS_PATH')
  })

  it('makes clear the Canvas is used ONLY when the human asks', () => {
    expect(body).toMatch(/ONLY when the human/i)
    expect(body).toMatch(/on your own initiative/i)
  })

  it('teaches the happy-path command sequence with the unified `orca-canvas` invocation', () => {
    expect(body).toContain('orca-canvas next')
    expect(body).toContain('orca-canvas claim')
    expect(body).toContain('orca-canvas set-status <id> done')
    expect(body).toContain('orca-canvas help')
    // Single unified form only — never the two-word `orca canvas`.
    expect(body).not.toMatch(/orca canvas /)
  })

  it('stays compact — it loads into every agent turn in every project', () => {
    expect(body.split('\n').length).toBeLessThanOrEqual(24)
  })
})
