import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
} from '@xyflow/react'
import { useEffect, useMemo, useRef } from 'react'
import { GraphNodeCard } from './GraphNodeCard.jsx'

const NODE_TYPES = {
  communicationNode: GraphNodeCard,
}

export function CommunicationGraph({
  edges,
  layoutKey,
  nodes,
  onFitReady,
  onLayoutResetReady,
  onSelectNode,
  selectedNodeId,
  viewMode,
}) {
  const { fitView } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const dragging = useRef(false)
  const edgeUpdateFrame = useRef(0)
  const fittedGraphSignature = useRef('')
  const groupDrag = useRef(null)
  const manualPositions = useRef(new Map())
  const previousLayoutKey = useRef(layoutKey)
  const [displayedNodes, setDisplayedNodes, onNodesChange] = useNodesState([])
  const viewportSignature = useMemo(
    () => graphViewportSignature(nodes, edges, layoutKey),
    [edges, layoutKey, nodes],
  )
  const fitOptions = useMemo(
    () => viewMode === 'connected'
      ? { maxZoom: 1.45, minZoom: 0.55, padding: 0.06 }
      : { maxZoom: 0.95, minZoom: 0.2, padding: 0.14 },
    [viewMode],
  )
  const refreshConnectedEdges = (nodeIds) => {
    window.cancelAnimationFrame(edgeUpdateFrame.current)
    edgeUpdateFrame.current = window.requestAnimationFrame(() => {
      updateNodeInternals(nodeIds)
    })
  }

  useEffect(() => () => {
    window.cancelAnimationFrame(edgeUpdateFrame.current)
  }, [])

  useEffect(() => {
    if (previousLayoutKey.current !== layoutKey) {
      previousLayoutKey.current = layoutKey
      manualPositions.current.clear()
    }
    if (dragging.current) {
      return
    }

    pruneManualPositions(manualPositions.current, nodes)
    setDisplayedNodes(mergeNodePositions(
      nodes,
      manualPositions.current,
      selectedNodeId,
    ))
  }, [layoutKey, nodes, selectedNodeId, setDisplayedNodes])

  useEffect(() => {
    onFitReady(() => fitView({ ...fitOptions, duration: 250 }))
  }, [fitOptions, fitView, onFitReady])

  useEffect(() => {
    onLayoutResetReady(() => {
      manualPositions.current.clear()
      fittedGraphSignature.current = viewportSignature
      setDisplayedNodes(mergeNodePositions(nodes, new Map(), selectedNodeId))
    })
  }, [
    nodes,
    onLayoutResetReady,
    selectedNodeId,
    setDisplayedNodes,
    viewportSignature,
  ])

  useEffect(() => {
    if (
      !nodes.length ||
      manualPositions.current.size > 0 ||
      fittedGraphSignature.current === viewportSignature
    ) {
      return
    }

    let fitFrame = 0
    const renderFrame = window.requestAnimationFrame(() => {
      fitFrame = window.requestAnimationFrame(() => {
        fittedGraphSignature.current = viewportSignature
        fitView(fitOptions)
      })
    })

    return () => {
      window.cancelAnimationFrame(renderFrame)
      window.cancelAnimationFrame(fitFrame)
    }
  }, [fitOptions, fitView, nodes.length, viewportSignature])

  return (
    <ReactFlow
      edges={edges}
      maxZoom={1.6}
      minZoom={0.2}
      nodeTypes={NODE_TYPES}
      nodes={displayedNodes}
      nodesDraggable
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onNodeDrag={(_, node) => {
        const dragState = groupDrag.current
        if (!dragState) {
          refreshConnectedEdges([node.id])
          return
        }

        const delta = {
          x: node.position.x - dragState.origin.x,
          y: node.position.y - dragState.origin.y,
        }
        setDisplayedNodes((currentNodes) => moveNodeGroup(
          currentNodes,
          dragState,
          delta,
        ))
        refreshConnectedEdges([...dragState.initialPositions.keys()])
      }}
      onNodeDragStart={(event, node) => {
        dragging.current = true
        if (event.shiftKey) {
          groupDrag.current = createGroupDragState(displayedNodes, node)
        }
      }}
      onNodeDragStop={(_, node) => {
        dragging.current = false
        const dragState = groupDrag.current
        if (!dragState) {
          manualPositions.current.set(node.id, { ...node.position })
          refreshConnectedEdges([node.id])
          return
        }

        const delta = {
          x: node.position.x - dragState.origin.x,
          y: node.position.y - dragState.origin.y,
        }
        const movedNodes = moveNodeGroup(displayedNodes, dragState, delta)
        setDisplayedNodes(movedNodes)
        for (const movedNode of movedNodes) {
          if (movedNode.data.kind === dragState.kind) {
            manualPositions.current.set(
              movedNode.id,
              { ...movedNode.position },
            )
          }
        }
        refreshConnectedEdges([...dragState.initialPositions.keys()])
        groupDrag.current = null
      }}
      onNodesChange={onNodesChange}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#263244" gap={22} size={1} />
      <MiniMap
        maskColor="rgba(4, 8, 13, 0.72)"
        nodeColor={(node) => minimapColor(node.data.kind)}
        pannable
        zoomable
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function mergeNodePositions(nodes, manualPositions, selectedNodeId) {
  return nodes.map((node) => ({
    ...node,
    position: manualPositions.get(node.id) ?? node.position,
    selected: node.id === selectedNodeId,
  }))
}

function createGroupDragState(nodes, draggedNode) {
  return {
    initialPositions: new Map(
      nodes
        .filter((node) => node.data.kind === draggedNode.data.kind)
        .map((node) => [node.id, { ...node.position }]),
    ),
    kind: draggedNode.data.kind,
    origin: { ...draggedNode.position },
  }
}

function moveNodeGroup(nodes, dragState, delta) {
  return nodes.map((node) => {
    const initialPosition = dragState.initialPositions.get(node.id)
    if (!initialPosition) {
      return node
    }

    return {
      ...node,
      position: {
        x: initialPosition.x + delta.x,
        y: initialPosition.y + delta.y,
      },
    }
  })
}

function pruneManualPositions(manualPositions, nodes) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  for (const nodeId of manualPositions.keys()) {
    if (!nodeIds.has(nodeId)) {
      manualPositions.delete(nodeId)
    }
  }
}

function graphViewportSignature(nodes, edges, layoutKey) {
  const nodeSignature = nodes
    .map((node) => `${node.id}:${node.position.x}:${node.position.y}`)
    .join('|')
  const edgeSignature = edges
    .map((edge) => `${edge.id}:${edge.source}:${edge.target}`)
    .join('|')

  return `${layoutKey}::${nodeSignature}::${edgeSignature}`
}

function minimapColor(kind) {
  if (kind === 'node') {
    return '#60a5fa'
  }
  if (kind === 'topic') {
    return '#34d399'
  }
  if (kind === 'service') {
    return '#fbbf24'
  }
  return '#f87171'
}
