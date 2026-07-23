import { useEffect, useMemo } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { NodeDetailPanel } from '../components/NodeDetailPanel.jsx'
import { NodeSummaryCards } from '../components/NodeSummaryCards.jsx'
import { NodeTable } from '../components/NodeTable.jsx'
import { isInternalNode, isPrimaryNode } from '../utils/nodeFilters.js'

const NODE_FILTERS = [
  { id: 'primary', label: '주요 항목' },
  { id: 'all', label: '전체' },
  { id: 'active', label: '실행 중' },
  { id: 'stale', label: '종료 감지' },
  { id: 'hidden', label: '숨김 포함' },
]

export function NodesPage({ dashboard, topics }) {
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

  const primaryNodes = useMemo(
    () =>
      nodes.filter((node) =>
        !isInternalNode(node) && isPrimaryNode(node, topics),
      ),
    [nodes, topics],
  )

  const filteredNodes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const baseNodes = includeInternalNodes
      ? nodes
      : nodes.filter((node) => !isInternalNode(node))

    return baseNodes.filter((node) => {
      const matchesStatus = statusFilter === 'primary'
        ? isPrimaryNode(node, topics)
        : statusFilter === 'all' || statusFilter === 'hidden'
          ? true
          : node.status === statusFilter
      const matchesSearch =
        !normalizedSearch || nodeMatchesSearch(node, normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [includeInternalNodes, nodes, search, statusFilter, topics])

  useEffect(() => {
    if (!filteredNodes.length) {
      return
    }

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
                기본 화면은 운영 시 먼저 확인할 핵심 Node와 종료가 감지된
                Node를 표시합니다.
              </p>
            </div>
            {loading && <span className="muted">로딩 중</span>}
            {error && <span className="error-text">Node API 연결 실패</span>}
          </div>
        </section>

        <NodeSummaryCards activeNodes={primaryNodes} meta={meta} nodes={nodes} />

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
                    onClick={() => {
                      setIncludeInternalNodes(filter.id === 'hidden')
                      setStatusFilter(filter.id)
                    }}
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
              statusFilter === 'hidden'
                ? '표시할 Node가 없습니다.'
                : "조건에 맞는 Node가 없습니다. 내부 Node는 '숨김 포함' 탭에서 확인하세요."
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
