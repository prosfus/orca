// Deterministic, human-readable, stable node ids. A task id is a slug of its title, frozen
// at creation (it does not change when the title is edited); collisions get a numeric suffix.

import { hasNodeId } from './canvas-document'
import type { Canvas } from './json-canvas-types'

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'item'
}

export function uniqueNodeId(canvas: Canvas, base: string): string {
  if (!hasNodeId(canvas, base)) {
    return base
  }
  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${base}-${i}`
    if (!hasNodeId(canvas, candidate)) {
      return candidate
    }
  }
  return `${base}-${Date.now()}`
}
