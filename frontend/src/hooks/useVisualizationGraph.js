import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchActions,
  fetchNodes,
  fetchServices,
  fetchTopics,
} from '../api/rosApi.js'
import { buildCommunicationGraph } from '../utils/graphTransform.js'
import {
  isHiddenGraphNode,
  nodeConnectionCount,
} from '../utils/graphTransform.js'
import { buildParticipantMaps } from '../utils/participants.js'
import { isInternalNode, isPrimaryNode } from '../utils/nodeFilters.js'
import { usePolling } from './usePolling.js'

const GRAPH_POLL_INTERVAL_MS = 5000

export function useVisualizationGraph() {
  const [activeOnly, setActiveOnly] = useState(true)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [nodeFilterMode, setNodeFilterMode] = useState('primary')
  const [search, setSearch] = useState('')
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState('')
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [showActions, setShowActions] = useState(true)
  const [showServices, setShowServices] = useState(true)
  const [showTopics, setShowTopics] = useState(true)
  const [viewMode, setViewMode] = useState('nodes')

  const nodeState = usePolling(fetchNodes, GRAPH_POLL_INTERVAL_MS, {
    initialData: { data: { nodes: [], meta: {} } },
  })
  const topicState = usePolling(fetchTopics, GRAPH_POLL_INTERVAL_MS, {
    initialData: { data: [], meta: {} },
  })
  const serviceFetcher = useCallback(
    () => fetchServices({ includeHidden }),
    [includeHidden],
  )
  const serviceState = usePolling(serviceFetcher, GRAPH_POLL_INTERVAL_MS, {
    initialData: { data: { services: [], meta: {} } },
  })
  const actionState = usePolling(fetchActions, GRAPH_POLL_INTERVAL_MS, {
    initialData: { data: { actions: [], meta: {} } },
  })

  const nodes = useMemo(
    () => nodeState.data?.data?.nodes ?? [],
    [nodeState.data],
  )
  const topics = useMemo(
    () => topicState.data?.data ?? [],
    [topicState.data],
  )
  const services = useMemo(
    () => serviceState.data?.data?.services ?? [],
    [serviceState.data],
  )
  const actions = useMemo(
    () => actionState.data?.data?.actions ?? [],
    [actionState.data],
  )
  const participantMaps = useMemo(
    () => buildParticipantMaps(nodes),
    [nodes],
  )
  const filters = useMemo(
    () => ({
      activeOnly,
      includeHidden,
      search,
      selectedNodeName,
      showActions,
      showServices,
      showTopics,
      viewMode,
    }),
    [
      activeOnly,
      includeHidden,
      search,
      selectedNodeName,
      showActions,
      showServices,
      showTopics,
      viewMode,
    ],
  )
  const nextGraph = useMemo(
    () =>
      buildCommunicationGraph({
        actions,
        filters,
        nodes,
        services,
        topics,
      }),
    [actions, filters, nodes, services, topics],
  )
  const graph = useStableGraph(nextGraph)
  const selectedGraphNode = useMemo(() => {
    const graphNode =
      graph.nodes.find((node) => node.id === selectedGraphNodeId) ?? null
    if (!graphNode) {
      return null
    }

    return {
      ...graphNode,
      data: {
        ...graphNode.data,
        participants: participantsForGraphNode(graphNode, participantMaps),
      },
    }
  }, [graph.nodes, participantMaps, selectedGraphNodeId])

  useEffect(() => {
    if (
      selectedGraphNodeId ||
      !graph.nodes.length ||
      viewMode !== 'all'
    ) {
      return
    }

    setSelectedGraphNodeId(graph.nodes[0].id)
  }, [graph.nodes, selectedGraphNodeId, viewMode])

  const selectableNodes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return nodes
      .filter((node) => {
        if (nodeFilterMode === 'primary') {
          return isPrimaryNode(node, { actions, services, topics })
        }
        if (nodeFilterMode === 'active') {
          return node.status === 'active' && !isInternalNode(node)
        }
        return includeHidden || !isHiddenGraphNode(node)
      })
      .filter((node) => {
        if (!normalizedSearch) {
          return true
        }
        return [
          node.full_name,
          node.name,
          node.namespace,
        ].some((value) =>
          String(value ?? '').toLowerCase().includes(normalizedSearch),
        )
      })
      .sort((left, right) => {
        const activeDelta =
          Number(right.status === 'active') - Number(left.status === 'active')
        if (activeDelta) {
          return activeDelta
        }
        return nodeConnectionCount(right) - nodeConnectionCount(left)
      })
  }, [actions, includeHidden, nodeFilterMode, nodes, search, services, topics])

  const refresh = () => {
    nodeState.refresh()
    topicState.refresh()
    serviceState.refresh()
    actionState.refresh()
  }

  return {
    activeOnly,
    actions,
    error:
      nodeState.error ||
      topicState.error ||
      serviceState.error ||
      actionState.error,
    graph,
    includeHidden,
    loading:
      nodeState.loading ||
      topicState.loading ||
      serviceState.loading ||
      actionState.loading,
    nodes,
    nodeFilterMode,
    refresh,
    search,
    selectableNodes,
    selectedGraphNode,
    selectedGraphNodeId,
    selectedGraphNodeMissing:
      Boolean(selectedGraphNodeId) && !selectedGraphNode,
    selectedNodeName,
    services,
    setActiveOnly,
    setIncludeHidden,
    setNodeFilterMode,
    setSearch,
    setSelectedGraphNodeId,
    setSelectedNodeName,
    setShowActions,
    setShowServices,
    setShowTopics,
    setViewMode,
    showActions,
    showServices,
    showTopics,
    topics,
    viewMode,
  }
}

function participantsForGraphNode(graphNode, participantMaps) {
  const { kind, label } = graphNode.data ?? {}
  if (kind === 'topic') {
    return participantMaps.topicParticipants[label] ?? {
      publishers: [],
      subscribers: [],
    }
  }
  if (kind === 'service') {
    return participantMaps.serviceParticipants[label] ?? {
      clients: [],
      servers: [],
    }
  }
  if (kind === 'action') {
    return participantMaps.actionParticipants[label] ?? {
      clients: [],
      servers: [],
    }
  }
  return null
}

function useStableGraph(nextGraph) {
  const previous = useRef({ graph: nextGraph, signature: '' })
  const signature = graphSignature(nextGraph)

  if (previous.current.signature === signature) {
    return previous.current.graph
  }

  previous.current = {
    graph: nextGraph,
    signature,
  }
  return nextGraph
}

function graphSignature(graph) {
  const nodeSignature = graph.nodes
    .map((node) => [
      node.id,
      node.data.kind,
      node.data.label,
      node.data.status,
      node.data.type,
      node.position.x,
      node.position.y,
    ].join('|'))
    .join('::')
  const edgeSignature = graph.edges
    .map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.label,
    ].join('|'))
    .join('::')

  return `${nodeSignature}###${edgeSignature}`
}
