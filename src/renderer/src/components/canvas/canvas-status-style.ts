import type { CanvasStatus } from '../../../../shared/canvas/canvas-status'

// Status mirrors map to quiet design tokens (STYLEGUIDE: reach for tokens before raw color).
// The file stores a theme-agnostic preset; only this render layer themes it.
export function statusColorVar(status: CanvasStatus): string {
  switch (status) {
    case 'todo':
      return 'var(--muted-foreground)'
    case 'in-progress':
      return 'var(--annotation-highlight)'
    case 'blocked':
      return 'var(--destructive)'
    case 'done':
      return 'var(--status-success)'
  }
}
