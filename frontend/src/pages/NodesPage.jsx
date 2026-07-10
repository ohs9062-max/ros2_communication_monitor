import { useEffect, useMemo } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { NodeDetailPanel } from '../components/NodeDetailPanel.jsx'
import { NodeSummaryCards } from '../components/NodeSummaryCards.jsx'
import { NodeTable } from '../components/NodeTable.jsx'

const NODE_FILTERS = [
  { id: 'primary', label: '주요 항목' },
  { id: 'all', label: '전체' },
  { id: 'active', label: '실행 중' },
  { id: 'stale', label: '종료 감지' },
]

export function NodesPage({ dashboard }) {
  const {
    alerts,
    error,
    includeInternalNodes,
    loading,
    meta,
    nodeAlerts,
    nodes,
    search,
    selectedNode,
    selectedNodeName,
    setIncludeInternalNodes,
    setSearch,
    setSelectedNodeName,
    setStatusFilter,
    statusFilter,
  } = dashboard

  const activeNodes = useMemo(
    () =>
      nodes.filter((node) =>
        !isInternalNode(node) && isActiveNode(node),
      ),
    [nodes],
  )

  const filteredNodes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const baseNodes = includeInternalNodes || statusFilter === 'all'
      ? nodes
      : activeNodes

    return baseNodes.filter((node) => {
      const matchesStatus =
        statusFilter === 'primary' ||
        statusFilter === 'all' ||
        node.status === statusFilter
      const matchesSearch =
        !normalizedSearch || nodeMatchesSearch(node, normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [activeNodes, includeInternalNodes, nodes, search, statusFilter])

  useEffect(() => {
    if (filteredNodes.some((node) => node.full_name === selectedNodeName)) {
      return
    }

    setSelectedNodeName(filteredNodes[0]?.full_name ?? '')
  }, [filteredNodes, selectedNodeName, setSelectedNodeName])

  const detailNode = filteredNodes.some(
    (node) => node.full_name === selectedNodeName,
  )
    ? selectedNode
    : null
  const openNodeAlert = (alert) => {
    const targetNode = nodes.find(
      (node) => node.full_name === alert.name || node.name === alert.name,
    )
    setIncludeInternalNodes(true)
    setSearch('')
    setStatusFilter('all')
    setSelectedNodeName(targetNode?.full_name ?? alert.name)
    focusMonitorRow(targetNode?.full_name ?? alert.name, setSelectedNodeName)
  }

  return (
    <main className="topics-page node-page">
      <section className="main-panel">
        <section className="topic-section page-intro">
          <div className="section-heading">
            <div>
              <h2>Nodes</h2>
              <p className="muted">
                기본 화면은 현재 활동 중이거나 최근 상태 변화가 관찰된 Node만
                표시합니다.
              </p>
            </div>
            {loading && <span className="muted">로딩 중</span>}
            {error && <span className="error-text">Node API 연결 실패</span>}
          </div>
        </section>

        <NodeSummaryCards activeNodes={activeNodes} meta={meta} nodes={nodes} />

        <AlertsPreview
          alerts={nodeAlerts}
          emptyMessage="현재 Node Alert가 없습니다."
          error={alerts.error}
          onAlertClick={openNodeAlert}
          title="Node Alert"
        />

        <section className="topic-section">
          <div className="filter-toolbar node-filter-bar">
            <input
              aria-label="Node 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Node, namespace, topic, service, action 검색"
              type="search"
              value={search}
            />
            <div className="service-filter-actions">
              <button
                className={includeInternalNodes ? 'filter active' : 'filter'}
                onClick={() =>
                  setIncludeInternalNodes(!includeInternalNodes)
                }
                type="button"
              >
                숨김 포함
              </button>
              <div
                className="filter-buttons"
                role="group"
                aria-label="Node 상태 필터"
              >
                {NODE_FILTERS.map((filter) => (
                  <button
                    className={
                      statusFilter === filter.id ? 'filter active' : 'filter'
                    }
                    key={filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <NodeTable
            emptyMessage={
              includeInternalNodes
                ? '표시할 Node가 없습니다.'
                : "현재 활동 중인 Node가 없습니다. 숨김 Node를 보려면 '숨김 Node 포함'을 켜세요."
            }
            nodes={filteredNodes}
            onSelectNode={setSelectedNodeName}
            selectedNodeName={selectedNodeName}
          />
        </section>
      </section>

      <NodeDetailPanel node={detailNode} />
    </main>
  )
}

function isInternalNode(node) {
  const name = String(node.name ?? '')
  const fullName = String(node.full_name ?? '')
  return (
    name.startsWith('_ros2cli_daemon') ||
    fullName.startsWith('/_ros2cli_daemon') ||
    name.includes('ros2cli_daemon') ||
    fullName.includes('ros2cli_daemon')
  )
}

function isActiveNode(node) {
  const connectionCount =
    (node.publisher_count ?? 0) +
    (node.subscriber_count ?? 0) +
    (node.service_server_count ?? 0) +
    (node.service_client_count ?? 0) +
    (node.action_server_count ?? 0) +
    (node.action_client_count ?? 0)

  return (
    (node.status === 'active' && connectionCount > 0) ||
    node.status === 'stale' ||
    (node.publisher_count ?? 0) > 0 ||
    (node.subscriber_count ?? 0) > 0 ||
    (node.service_server_count ?? 0) > 0 ||
    (node.action_server_count ?? 0) > 0 ||
    (node.action_client_count ?? 0) > 0
  )
}

function nodeMatchesSearch(node, search) {
  const fields = [
    node.full_name,
    node.name,
    node.namespace,
    ...entitySearchFields(node.topic_publishers),
    ...entitySearchFields(node.topic_subscribers),
    ...entitySearchFields(node.service_servers),
    ...entitySearchFields(node.service_clients),
    ...entitySearchFields(node.action_servers),
    ...entitySearchFields(node.action_clients),
  ]

  return fields.some((field) =>
    String(field ?? '').toLowerCase().includes(search),
  )
}

function entitySearchFields(items = []) {
  return items.flatMap((item) => [item.name, item.type, ...(item.types ?? [])])
}

function focusMonitorRow(name, select) {
  window.setTimeout(() => focusMonitorRowAttempt(name, select, 0), 50)
}

function focusMonitorRowAttempt(name, select, attempt) {
  select(name)
  const row = findMonitorRow(name)
  if (row) {
    row.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    return
  }

  if (attempt < 6) {
    window.setTimeout(() => focusMonitorRowAttempt(name, select, attempt + 1), 80)
  }
}

function findMonitorRow(name) {
  return [...document.querySelectorAll('[data-monitor-name]')].find(
    (row) => row.getAttribute('data-monitor-name') === name,
  )
}
