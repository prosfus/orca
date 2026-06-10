// A Canvas task's `owner` is an agent's pane key (`tabId:leafId`). When that pane no longer
// exists, the claim is stale and the human can release it. The live pane set is the leaf ids
// currently present in each terminal tab's layout (same source the note-send target uses).

import { useMemo } from 'react'
import { useAppStore } from '@/store'

export function useStaleClaim(worktreeId: string): (owner: string | undefined) => boolean {
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((state) => state.terminalLayoutsByTabId)

  return useMemo(() => {
    const live = new Set<string>()
    for (const tab of tabsByWorktree[worktreeId] ?? []) {
      const leafIds = Object.keys(terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {})
      for (const leafId of leafIds) {
        live.add(`${tab.id}:${leafId}`)
      }
    }
    return (owner: string | undefined): boolean => Boolean(owner) && !live.has(owner as string)
  }, [worktreeId, tabsByWorktree, terminalLayoutsByTabId])
}
