// Projects a parsed Canvas into the flat CanvasPlanView the renderer draws. Pure (no I/O);
// readiness and geometry are resolved here so the renderer renders without the engine.

import { listGroupNodes, listTaskNodes, readTask } from './canvas-document'
import { isTaskReady } from './canvas-graph'
import type { CanvasArtifactView, CanvasPlanView } from './canvas-plan-view'
import type { Canvas } from './json-canvas-types'

export function buildPlanView(canvas: Canvas): CanvasPlanView {
  const tasks = listTaskNodes(canvas).map((node) => {
    const task = readTask(node)
    return {
      id: node.id,
      title: task.title,
      body: task.body,
      status: task.status,
      ready: isTaskReady(canvas, node.id),
      owner: task.owner,
      priority: task.priority,
      est: task.est,
      ref: task.ref,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    }
  })

  const phases = listGroupNodes(canvas).map((group) => ({
    id: group.id,
    label: group.label ?? '',
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height
  }))

  const edges = canvas.edges.map((edge) => ({
    id: edge.id,
    fromNode: edge.fromNode,
    toNode: edge.toNode
  }))

  const artifacts: CanvasArtifactView[] = []
  for (const node of canvas.nodes) {
    if (node.type === 'file') {
      artifacts.push({
        id: node.id,
        kind: 'file',
        target: node.file,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      })
    } else if (node.type === 'link') {
      artifacts.push({
        id: node.id,
        kind: 'link',
        target: node.url,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      })
    }
  }

  return { tasks, phases, edges, artifacts }
}
