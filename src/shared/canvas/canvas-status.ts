// The stored lifecycle marker of a Canvas task, and its mirror to a JSON Canvas color
// preset. Presets (not hex) keep the file theme-agnostic; Orca maps them to quiet tokens
// when rendering. `blocked` is a manual "needs attention" flag, distinct from readiness.

import type { CanvasColor } from './json-canvas-types'

export const CANVAS_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const
export type CanvasStatus = (typeof CANVAS_STATUSES)[number]

export function isCanvasStatus(value: string): value is CanvasStatus {
  return (CANVAS_STATUSES as readonly string[]).includes(value)
}

// Status → JSON Canvas color preset. `todo` carries no color (neutral default).
export function colorForStatus(status: CanvasStatus): CanvasColor | undefined {
  switch (status) {
    case 'todo':
      return undefined
    case 'in-progress':
      return '3' // yellow
    case 'blocked':
      return '1' // red
    case 'done':
      return '4' // green
  }
}
