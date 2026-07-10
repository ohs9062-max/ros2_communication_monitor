import { Handle, Position } from '@xyflow/react'
import { StatusBadge } from '../StatusBadge.jsx'

const KIND_LABELS = {
  action: 'Action',
  node: 'Node',
  service: 'Service',
  topic: 'Topic',
}

export function GraphNodeCard({ data }) {
  const connectionCount =
    (data.connections?.incoming.length ?? 0) +
    (data.connections?.outgoing.length ?? 0)

  return (
    <div className={`comm-node-card kind-${data.kind}`}>
      <Handle className="comm-handle" position={Position.Left} type="target" />
      <div className="comm-node-topline">
        <span className="comm-node-kind">{KIND_LABELS[data.kind]}</span>
        <StatusBadge value={data.status ?? 'unknown'} />
      </div>
      <strong className="comm-node-title">{data.label}</strong>
      <span className="comm-node-type">{data.type ?? '-'}</span>
      <span className="comm-node-meta">{connectionCount} 연결</span>
      <Handle className="comm-handle" position={Position.Right} type="source" />
    </div>
  )
}
