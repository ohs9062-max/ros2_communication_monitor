import { useEffect, useMemo, useState } from 'react'
import { fetchAlerts, fetchNodes } from '../api/rosApi.js'
import { usePolling } from './usePolling.js'

const NODE_POLL_INTERVAL_MS = 3000
const ALERT_POLL_INTERVAL_MS = 3000

export function useNodeDashboard() {
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [includeInternalNodes, setIncludeInternalNodes] = useState(false)

  const nodesState = usePolling(fetchNodes, NODE_POLL_INTERVAL_MS, {
    initialData: { data: { nodes: [], meta: {} } },
  })
  const alertsState = usePolling(fetchAlerts, ALERT_POLL_INTERVAL_MS, {
    initialData: { data: [], meta: {} },
  })

  const nodes = useMemo(
    () => nodesState.data?.data?.nodes ?? [],
    [nodesState.data],
  )
  const meta = nodesState.data?.data?.meta ?? {}
  const nodeAlerts = useMemo(
    () =>
      (alertsState.data?.data ?? []).filter(
        (alert) => alert.source === 'node' || alert.code === 'node_stale',
      ),
    [alertsState.data],
  )
  const selectedNode = useMemo(
    () =>
      nodes.find((node) => node.full_name === selectedNodeName) ?? null,
    [nodes, selectedNodeName],
  )

  useEffect(() => {
    if (selectedNodeName && selectedNode) {
      return
    }

    setSelectedNodeName(nodes[0]?.full_name ?? '')
  }, [nodes, selectedNode, selectedNodeName])

  return {
    alerts: alertsState,
    error: nodesState.error,
    includeInternalNodes,
    loading: nodesState.loading,
    meta,
    nodeAlerts,
    nodes,
    refresh: nodesState.refresh,
    search,
    setSelectedNode: setSelectedNodeName,
    selectedNode,
    selectedNodeName,
    setIncludeInternalNodes,
    setSearch,
    setSelectedNodeName,
    setStatusFilter,
    statusFilter,
  }
}
