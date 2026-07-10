import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useRef } from 'react'
import { GraphNodeCard } from './GraphNodeCard.jsx'

const NODE_TYPES = {
  communicationNode: GraphNodeCard,
}

export function CommunicationGraph({
  edges,
  nodes,
  onFitReady,
  onSelectNode,
  selectedNodeId,
}) {
  const { fitView } = useReactFlow()
  const didInitialFit = useRef(false)
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [nodes, selectedNodeId],
  )

  useEffect(() => {
    onFitReady(() => fitView({ duration: 450, padding: 0.16 }))
  }, [fitView, onFitReady])

  useEffect(() => {
    if (didInitialFit.current || !nodes.length) {
      return
    }

    didInitialFit.current = true
    window.requestAnimationFrame(() => {
      fitView({ duration: 450, padding: 0.16 })
    })
  }, [fitView, nodes.length])

  return (
    <ReactFlow
      edges={edges}
      maxZoom={1.4}
      minZoom={0.2}
      nodeTypes={NODE_TYPES}
      nodes={displayedNodes}
      onNodeClick={(_, node) => onSelectNode(node.id)}
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
