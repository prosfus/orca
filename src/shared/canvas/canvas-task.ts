// A Canvas task is a JSON Canvas `text` node whose markdown begins with a scalar-only
// YAML front-matter block, then a `# Title`, then a free body (description / criteria /
// notes). Relationships (dependencies, artifacts) live as edges/nodes — never here.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import { CANVAS_STATUSES } from './canvas-status'

export const CANVAS_PRIORITIES = ['low', 'normal', 'high'] as const
export type CanvasPriority = (typeof CANVAS_PRIORITIES)[number]

export function isCanvasPriority(value: string): value is CanvasPriority {
  return (CANVAS_PRIORITIES as readonly string[]).includes(value)
}

const frontMatterSchema = z.object({
  status: z.enum(CANVAS_STATUSES),
  owner: z.string().optional(),
  claimedAt: z.string().optional(),
  priority: z.enum(CANVAS_PRIORITIES).optional(),
  est: z.string().optional(),
  ref: z.string().optional()
})

export type CanvasTaskFrontMatter = z.infer<typeof frontMatterSchema>

export type CanvasTask = CanvasTaskFrontMatter & {
  id: string
  title: string
  body: string
}

// Captures the front-matter block, then everything after the closing fence.
const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

export function parseTaskNodeText(text: string): {
  frontMatter: CanvasTaskFrontMatter
  title: string
  body: string
} {
  const match = FRONT_MATTER_RE.exec(text)
  if (!match) {
    throw new Error('Canvas task node is missing its `---` front-matter block')
  }
  const frontMatter = frontMatterSchema.parse(parseYaml(match[1]) ?? {})
  return { frontMatter, ...splitTitleAndBody(match[2]) }
}

function splitTitleAndBody(markdown: string): { title: string; body: string } {
  const lines = markdown.split('\n')
  const titleIndex = lines.findIndex((line) => line.startsWith('# '))
  if (titleIndex === -1) {
    return { title: '', body: markdown.trim() }
  }
  return {
    title: lines[titleIndex].slice(2).trim(),
    body: lines
      .slice(titleIndex + 1)
      .join('\n')
      .trim()
  }
}

export function serializeTaskNodeText(
  frontMatter: CanvasTaskFrontMatter,
  title: string,
  body: string
): string {
  const yaml = stringifyYaml(orderedFrontMatter(frontMatter)).trimEnd()
  const parts = [`---\n${yaml}\n---`, `# ${title}`.trimEnd()]
  if (body.trim().length > 0) {
    parts.push(body.trim())
  }
  return `${parts.join('\n\n')}\n`
}

// Stable key order keeps diffs quiet; undefined scalars are omitted (never emitted as null).
function orderedFrontMatter(fm: CanvasTaskFrontMatter): Record<string, string> {
  const ordered: Record<string, string> = { status: fm.status }
  if (fm.priority) {
    ordered.priority = fm.priority
  }
  if (fm.owner) {
    ordered.owner = fm.owner
  }
  if (fm.claimedAt) {
    ordered.claimedAt = fm.claimedAt
  }
  if (fm.est) {
    ordered.est = fm.est
  }
  if (fm.ref) {
    ordered.ref = fm.ref
  }
  return ordered
}
