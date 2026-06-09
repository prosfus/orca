// JSON Canvas (Obsidian) structural types — the raw file shapes only.
// Spec: https://jsoncanvas.org/. Plan semantics (task / phase / dependency / status)
// are layered on top by convention elsewhere, never encoded into these shapes.

// A preset "1".."6" or a hex string like "#RRGGBB".
export type CanvasColor = string

export type CanvasNodeSide = 'top' | 'right' | 'bottom' | 'left'
export type CanvasEdgeEnd = 'none' | 'arrow'

type CanvasNodeBase = {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: CanvasColor
}

export type CanvasTextNode = CanvasNodeBase & { type: 'text'; text: string }
export type CanvasFileNode = CanvasNodeBase & { type: 'file'; file: string; subpath?: string }
export type CanvasLinkNode = CanvasNodeBase & { type: 'link'; url: string }
export type CanvasGroupNode = CanvasNodeBase & {
  type: 'group'
  label?: string
  background?: string
  backgroundStyle?: 'cover' | 'ratio' | 'repeat'
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode

export type CanvasNodeType = CanvasNode['type']

export type CanvasEdge = {
  id: string
  fromNode: string
  fromSide?: CanvasNodeSide
  fromEnd?: CanvasEdgeEnd
  toNode: string
  toSide?: CanvasNodeSide
  toEnd?: CanvasEdgeEnd
  color?: CanvasColor
  label?: string
}

export type Canvas = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export function emptyCanvas(): Canvas {
  return { nodes: [], edges: [] }
}

export function isTextNode(node: CanvasNode): node is CanvasTextNode {
  return node.type === 'text'
}

export function isGroupNode(node: CanvasNode): node is CanvasGroupNode {
  return node.type === 'group'
}
