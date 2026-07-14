import { Handle, Position } from '@xyflow/react'
import { StatusBadge } from '../StatusBadge.jsx'

const KIND_LABELS = {
  action: 'Action',
  node: 'Node',
  service: 'Service',
  topic: 'Topic',
}
const HANDLE_POSITIONS = [
  ['left', Position.Left],
  ['right', Position.Right],
  ['top', Position.Top],
  ['bottom', Position.Bottom],
]

export function GraphNodeCard({ data }) {
  const connectionCount =
    (data.connections?.incoming.length ?? 0) +
    (data.connections?.outgoing.length ?? 0)

  return (
    <div className={`comm-node-card kind-${data.kind}`}>
      {HANDLE_POSITIONS.map(([id, position]) => (
        <Handle
          className="comm-handle"
          id={`target-${id}`}
          key={`target-${id}`}
          position={position}
          type="target"
        />
      ))}
      <div className="comm-node-topline">
        <span className="comm-node-kind">{KIND_LABELS[data.kind]}</span>
        <StatusBadge value={data.status ?? 'unknown'} />
      </div>
      <strong className="comm-node-title">{data.label}</strong>
      <span className="comm-node-type">{data.type ?? '-'}</span>
      <span className="comm-node-meta">{connectionCount} 연결</span>
      {HANDLE_POSITIONS.map(([id, position]) => (
        <Handle
          className="comm-handle"
          id={`source-${id}`}
          key={`source-${id}`}
          position={position}
          type="source"
        />
      ))}
    </div>
  )
}
