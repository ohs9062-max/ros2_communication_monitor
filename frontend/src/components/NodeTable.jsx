import { useMemo, useState } from 'react'
import { formatRelativeTime } from '../utils/format.js'
import { nextSortState, sortRows } from '../utils/sort.js'
import { SortableHeader } from './SortableHeader.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const NODE_SORT_COLUMNS = {
  status: { value: (node) => node.status },
  full_name: { value: (node) => node.full_name },
  namespace: { value: (node) => node.namespace },
  publisher_count: {
    defaultDirection: 'desc',
    value: (node) => node.publisher_count,
  },
  subscriber_count: {
    defaultDirection: 'desc',
    value: (node) => node.subscriber_count,
  },
  service_server_count: {
    defaultDirection: 'desc',
    value: (node) => node.service_server_count,
  },
  service_client_count: {
    defaultDirection: 'desc',
    value: (node) => node.service_client_count,
  },
  action_server_count: {
    defaultDirection: 'desc',
    value: (node) => node.action_server_count,
  },
  action_client_count: {
    defaultDirection: 'desc',
    value: (node) => node.action_client_count,
  },
  last_seen_at: {
    defaultDirection: 'desc',
    value: (node) => node.last_seen_at,
  },
}

export function NodeTable({
  emptyMessage = '표시할 Node가 없습니다.',
  nodes,
  onSelectNode,
  selectedNodeName,
}) {
  const [sort, setSort] = useState({ key: 'full_name', direction: 'asc' })
  const sortedNodes = useMemo(
    () => sortRows(nodes, sort, NODE_SORT_COLUMNS),
    [nodes, sort],
  )
  const onSort = (key) => setSort((current) =>
    nextSortState(current, key, NODE_SORT_COLUMNS),
  )

  if (!nodes.length) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="table-wrap">
      <table className="topic-table node-table">
        <thead>
          <tr>
            <SortableHeader columnKey="status" label="상태" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="full_name" label="Node" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="namespace" label="Namespace" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="publisher_count" label="발행" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="subscriber_count" label="구독" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="service_server_count" label="응답 Service" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="service_client_count" label="요청 Service" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="action_server_count" label="Goal 실행" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="action_client_count" label="Goal 요청" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="last_seen_at" label="마지막 확인" onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedNodes.map((node) => {
            const selected = node.full_name === selectedNodeName
            return (
              <tr
                className={selected ? 'selected' : ''}
                data-monitor-name={node.full_name}
                key={node.full_name}
                onClick={() => onSelectNode(node.full_name)}
              >
                <td>
                  <NodeStatusBadge status={node.status} />
                </td>
                <td className="topic-name node-name">{node.full_name}</td>
                <td className="topic-type node-namespace">
                  {node.namespace ?? '-'}
                </td>
                <td>{node.publisher_count ?? 0}</td>
                <td>{node.subscriber_count ?? 0}</td>
                <td>{node.service_server_count ?? 0}</td>
                <td>{node.service_client_count ?? 0}</td>
                <td>{node.action_server_count ?? 0}</td>
                <td>{node.action_client_count ?? 0}</td>
                <td>{formatRelativeTime(node.last_seen_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function NodeStatusBadge({ status }) {
  return <StatusBadge label={nodeStatusLabel(status)} value={status} />
}

function nodeStatusLabel(status) {
  const labels = {
    active: '실행 중',
    stale: '종료 감지',
    inactive: '비활성',
    unknown: '알 수 없음',
  }

  return labels[String(status || 'unknown').toLowerCase()] ?? '알 수 없음'
}
