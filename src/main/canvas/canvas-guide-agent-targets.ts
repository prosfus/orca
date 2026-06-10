// The set of agents whose global markdown memory file Orca teaches about the
// Canvas, plus the local/remote orchestrators that install (or remove) the guide
// block. Mirrors the managed agent-hook installer registries: one row per agent
// is the whole extension point, and each agent installs under its own try/catch
// so one failure never blocks the rest.

import { homedir } from 'node:os'
import path from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { WellKnownAgentType } from '../../shared/agent-status-types'
import {
  readTextFileRemote,
  writeTextFileRemoteAtomic
} from '../agent-hooks/installer-utils-remote'
import { canvasGuideBody } from './canvas-guide-text'
import {
  removeCanvasGuide,
  upsertCanvasGuideBlock,
  writeCanvasGuide
} from './canvas-guide-memory-block'

export type CanvasGuideTarget = {
  agent: WellKnownAgentType
  configDirName: string
  memoryFileName: string
}

// Agents with a real, global markdown memory file Orca can append to. Others have
// no such file (or an unconfirmed location) and join as a row once verified
// (e.g. droid/Factory → '.factory' + 'AGENTS.md').
export const CANVAS_GUIDE_TARGETS: readonly CanvasGuideTarget[] = [
  { agent: 'claude', configDirName: '.claude', memoryFileName: 'CLAUDE.md' },
  { agent: 'openclaude', configDirName: '.openclaude', memoryFileName: 'CLAUDE.md' },
  { agent: 'codex', configDirName: '.codex', memoryFileName: 'AGENTS.md' },
  { agent: 'gemini', configDirName: '.gemini', memoryFileName: 'GEMINI.md' }
]

export function localMemoryPath(target: CanvasGuideTarget, home = homedir()): string {
  return path.join(home, target.configDirName, target.memoryFileName)
}

// POSIX remote path; strip a trailing slash like getRemoteConfigPath does.
export function remoteMemoryPath(remoteHome: string, target: CanvasGuideTarget): string {
  return `${remoteHome.replace(/\/$/, '')}/${target.configDirName}/${target.memoryFileName}`
}

export function installCanvasGuideLocal(): void {
  const body = canvasGuideBody()
  for (const target of CANVAS_GUIDE_TARGETS) {
    try {
      writeCanvasGuide(localMemoryPath(target), body)
    } catch (error) {
      console.warn(`[canvas] Failed to install Canvas guide for ${target.agent}:`, error)
    }
  }
}

export function removeCanvasGuideLocal(): void {
  for (const target of CANVAS_GUIDE_TARGETS) {
    try {
      removeCanvasGuide(localMemoryPath(target))
    } catch (error) {
      console.warn(`[canvas] Failed to remove Canvas guide for ${target.agent}:`, error)
    }
  }
}

// Same merge logic as local (upsert the block), only the fs primitives differ —
// keeping local and remote in lock-step, as the agent-hooks remote installer does.
export async function installRemoteCanvasGuide(
  sftp: SFTPWrapper,
  remoteHome: string,
  body = canvasGuideBody()
): Promise<void> {
  for (const target of CANVAS_GUIDE_TARGETS) {
    try {
      const remotePath = remoteMemoryPath(remoteHome, target)
      const existing = (await readTextFileRemote(sftp, remotePath)) ?? ''
      await writeTextFileRemoteAtomic(sftp, remotePath, upsertCanvasGuideBlock(existing, body))
    } catch (error) {
      console.warn(`[canvas] Failed to install remote Canvas guide for ${target.agent}:`, error)
    }
  }
}
