import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the I/O layers so the local orchestrator never writes the developer's real
// ~/.claude/CLAUDE.md, and the remote one never needs a live SFTP handle.
vi.mock('./canvas-guide-memory-block', () => ({
  writeCanvasGuide: vi.fn(),
  removeCanvasGuide: vi.fn(),
  upsertCanvasGuideBlock: vi.fn((_existing: string, body: string) => `WRAPPED:${body}`)
}))
vi.mock('../agent-hooks/installer-utils-remote', () => ({
  readTextFileRemote: vi.fn(async () => null),
  writeTextFileRemoteAtomic: vi.fn(async () => {})
}))

import {
  readTextFileRemote,
  writeTextFileRemoteAtomic
} from '../agent-hooks/installer-utils-remote'
import {
  CANVAS_GUIDE_TARGETS,
  installCanvasGuideLocal,
  installRemoteCanvasGuide,
  localMemoryPath,
  remoteMemoryPath
} from './canvas-guide-agent-targets'
import { writeCanvasGuide } from './canvas-guide-memory-block'

const claude = CANVAS_GUIDE_TARGETS.find((t) => t.agent === 'claude')!

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('memory path derivation', () => {
  it('builds the local path under the home dir', () => {
    expect(localMemoryPath(claude, '/home/dev').replace(/\\/g, '/')).toBe(
      '/home/dev/.claude/CLAUDE.md'
    )
  })

  it('builds a POSIX remote path and strips a trailing slash', () => {
    expect(remoteMemoryPath('/home/dev/', claude)).toBe('/home/dev/.claude/CLAUDE.md')
    expect(
      remoteMemoryPath('/home/dev', {
        agent: 'codex',
        configDirName: '.codex',
        memoryFileName: 'AGENTS.md'
      })
    ).toBe('/home/dev/.codex/AGENTS.md')
  })

  it('covers the four agents with a confirmed global memory file', () => {
    expect(CANVAS_GUIDE_TARGETS.map((t) => t.agent).sort()).toEqual([
      'claude',
      'codex',
      'gemini',
      'openclaude'
    ])
  })
})

describe('installCanvasGuideLocal', () => {
  it('is fail-open: one target throwing does not skip the rest', () => {
    vi.mocked(writeCanvasGuide).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    installCanvasGuideLocal()
    expect(writeCanvasGuide).toHaveBeenCalledTimes(CANVAS_GUIDE_TARGETS.length)
  })
})

describe('installRemoteCanvasGuide', () => {
  it('upserts the body into each derived remote path', async () => {
    await installRemoteCanvasGuide({} as never, '/home/dev/', 'BODY')
    expect(writeTextFileRemoteAtomic).toHaveBeenCalledTimes(CANVAS_GUIDE_TARGETS.length)
    const [, firstPath, firstContent] = vi.mocked(writeTextFileRemoteAtomic).mock.calls[0]
    expect(firstPath).toBe('/home/dev/.claude/CLAUDE.md')
    expect(firstContent).toBe('WRAPPED:BODY')
  })

  it('is fail-open: one read failure does not abort the loop', async () => {
    vi.mocked(readTextFileRemote).mockRejectedValueOnce(new Error('io'))
    await installRemoteCanvasGuide({} as never, '/home/dev', 'BODY')
    expect(writeTextFileRemoteAtomic).toHaveBeenCalledTimes(CANVAS_GUIDE_TARGETS.length - 1)
  })
})
