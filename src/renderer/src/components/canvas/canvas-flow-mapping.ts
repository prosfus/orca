// Pure mapping from the render-ready CanvasPlanView to react-flow nodes/edges. Kept separate
// from the React components so it can be unit-tested without a DOM. Positions come straight
// from the file (real coordinates). `editable` makes tasks/artifacts draggable; phase groups
// stay fixed (they are visual containers, not movable nodes).

import type { Edge, Node } from '@xyflow/react'
import type { CanvasPlanView } from '../../../../shared/canvas/canvas-plan-view'

export function planToFlow(
  plan: CanvasPlanView,
  editable = false
): { nodes: Node[]; edges: Edge[] } {
  const phaseNodes: Node[] = plan.phases.map((phase) => ({
    id: phase.id,
    type: 'phase',
    position: { x: phase.x, y: phase.y },
    data: { label: phase.label },
    style: { width: phase.width, height: phase.height },
    draggable: false,
    selectable: false,
    // Why: phase groups are visual containers; render them behind the tasks they enclose.
    zIndex: 0
  }))

  const taskNodes: Node[] = plan.tasks.map((task) => ({
    id: task.id,
    type: 'task',
    position: { x: task.x, y: task.y },
    data: { ...task },
    style: { width: task.width, height: task.height },
    draggable: editable,
    zIndex: 1
  }))

  const artifactNodes: Node[] = plan.artifacts.map((artifact) => ({
    id: artifact.id,
    type: 'artifact',
    position: { x: artifact.x, y: artifact.y },
    data: { ...artifact },
    style: { width: artifact.width, height: artifact.height },
    draggable: editable,
    zIndex: 1
  }))

  const edges: Edge[] = plan.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode
  }))

  return { nodes: [...phaseNodes, ...taskNodes, ...artifactNodes], edges }
}
