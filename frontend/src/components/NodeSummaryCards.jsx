import { SummaryCard } from './SummaryCard.jsx'

export function NodeSummaryCards({ activeNodes = [], meta = {}, nodes = [] }) {
  const total = meta.count ?? nodes.length
  const active = meta.active_count ?? countByStatus(nodes, 'active')
  const stale = countByStatus(nodes, 'stale')

  return (
    <div className="summary-grid node-summary-grid">
      <SummaryCard label="전체 Node" value={total} />
      <SummaryCard label="활동 Node" value={activeNodes.length} tone="good" />
      <SummaryCard label="실행 중" value={active} tone="good" />
      <SummaryCard
        label="Stale"
        tone={stale ? 'warn' : 'default'}
        value={stale}
      />
      <SummaryCard
        label="Publishers"
        value={meta.publisher_count ?? sumCount(nodes, 'publisher_count')}
      />
      <SummaryCard
        label="Subscribers"
        value={meta.subscriber_count ?? sumCount(nodes, 'subscriber_count')}
      />
    </div>
  )
}

function countByStatus(nodes, status) {
  return nodes.filter((node) => node.status === status).length
}

function sumCount(nodes, key) {
  return nodes.reduce((sum, node) => sum + (node[key] ?? 0), 0)
}
