import type { Diagnostico } from '../../../../shared/types'

// Why: mirrors the WorktreeCardMetadataStatusBadges tone recipe so diagnostic
// states read with the same visual language as the rest of the sidebar.
export const DIAGNOSTICO_STATUS_META: Record<
  Diagnostico['status'],
  { label: string; tone: string }
> = {
  investigating: {
    label: 'Investigando',
    tone: 'border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-300'
  },
  ready: {
    label: 'Listo',
    tone: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300'
  },
  failed: {
    label: 'Fallo',
    tone: 'border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-300'
  }
}
