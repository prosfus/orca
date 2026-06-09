import { describe, expect, it } from 'vitest'
import { colorForStatus, isCanvasStatus } from './canvas-status'
import { parseTaskNodeText, serializeTaskNodeText } from './canvas-task'

describe('canvas-task front matter', () => {
  it('round-trips status, scalars, title and body', () => {
    const text = serializeTaskNodeText(
      { status: 'in-progress', priority: 'high', owner: 'tabA:leafB', ref: '#482' },
      'Implementar login',
      'Validar credenciales.\n\n- [ ] valida\n- [ ] error 401'
    )
    const parsed = parseTaskNodeText(text)
    expect(parsed.frontMatter).toEqual({
      status: 'in-progress',
      priority: 'high',
      owner: 'tabA:leafB',
      ref: '#482'
    })
    expect(parsed.title).toBe('Implementar login')
    expect(parsed.body).toContain('- [ ] error 401')
  })

  it('omits undefined scalars from the serialized block', () => {
    const text = serializeTaskNodeText({ status: 'todo' }, 'Bare', '')
    expect(text).not.toContain('owner')
    expect(text).not.toContain('priority')
    expect(parseTaskNodeText(text).frontMatter).toEqual({ status: 'todo' })
  })

  it('throws when the front-matter block is missing', () => {
    expect(() => parseTaskNodeText('# No front matter')).toThrow(/front-matter/)
  })

  it('rejects an unknown status value', () => {
    const text = '---\nstatus: wat\n---\n# X'
    expect(() => parseTaskNodeText(text)).toThrow()
  })
})

describe('canvas-status', () => {
  it('maps statuses to presets, with no color for todo', () => {
    expect(colorForStatus('todo')).toBeUndefined()
    expect(colorForStatus('in-progress')).toBe('3')
    expect(colorForStatus('blocked')).toBe('1')
    expect(colorForStatus('done')).toBe('4')
  })

  it('guards status strings', () => {
    expect(isCanvasStatus('done')).toBe(true)
    expect(isCanvasStatus('nope')).toBe(false)
  })
})
