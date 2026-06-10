// Holds the react-flow node/edge state for the editable board and turns interactions into
// CanvasMutations through canvas:mutate. The dirty-guard (`interacting`) keeps a poll/agent update
// from snapping a node the user is mid-drag; after a mutation resolves, the fresh plan is adopted.

import { useCallback, useEffect, useRef } from 'react'
import { useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react'
import type { CanvasMutation } from '../../../../shared/canvas/canvas-mutation'
import type { CanvasPlanView } from '../../../../shared/canvas/canvas-plan-view'
import { planToFlow } from './canvas-flow-mapping'

export function useCanvasEditing(
  worktreeId: string,
  plan: CanvasPlanView | null,
  editable: boolean
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const interacting = useRef(false)

  const adopt = useCallback(
    (next: CanvasPlanView | null) => {
      const flow = next ? planToFlow(next, editable) : { nodes: [], edges: [] }
      setNodes(flow.nodes)
      setEdges(flow.edges)
    },
    [setNodes, setEdges, editable]
  )

  useEffect(() => {
    if (!interacting.current) {
      adopt(plan)
    }
  }, [plan, adopt])

  const mutate = useCallback(
    (mutation: CanvasMutation) => {
      if (!editable) {
        return
      }
      void window.api.canvas
        .mutate({ worktreeId, mutation })
        .then((result) => adopt(result.plan))
        .catch((error: unknown) => {
          console.warn('[canvas] mutation failed:', error)
          adopt(plan)
        })
        .finally(() => {
          interacting.current = false
        })
    },
    [worktreeId, editable, adopt, plan]
  )

  const onNodeDragStart = useCallback(() => {
    interacting.current = true
  }, [])

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      mutate({
        op: 'setPosition',
        id: node.id,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y)
      })
    },
    [mutate]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        mutate({ op: 'link', from: connection.source, to: connection.target })
      }
    },
    [mutate]
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        mutate({ op: 'unlink', from: edge.source, to: edge.target })
      }
    },
    [mutate]
  )

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) {
        if (node.type === 'task') {
          mutate({ op: 'removeTask', id: node.id, force: true })
        }
      }
    },
    [mutate]
  )

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStart,
    onNodeDragStop,
    onEdgesDelete,
    onNodesDelete,
    mutate
  }
}
