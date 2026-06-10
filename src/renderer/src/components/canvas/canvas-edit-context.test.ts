import { describe, expect, it } from 'vitest'
import { nextStatus } from './canvas-edit-context'

describe('nextStatus', () => {
  it('cycles todo -> in-progress -> done -> todo', () => {
    expect(nextStatus('todo')).toBe('in-progress')
    expect(nextStatus('in-progress')).toBe('done')
    expect(nextStatus('done')).toBe('todo')
  })

  it('advances an off-cycle status (blocked) to in-progress', () => {
    expect(nextStatus('blocked')).toBe('in-progress')
  })
})
