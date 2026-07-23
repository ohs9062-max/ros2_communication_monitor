const INTERNAL_TOPICS = new Set([
  '/clock',
  '/parameter_events',
  '/rosout',
  '/tf',
  '/tf_static',
])

const NODE_GAP_Y = 112
const COLUMN_WIDTH = 330
const NODE_VIEW_LIMITS = {
  action: 20,
  edge: 80,
  service: 20,
  topic: 30,
}

export function buildCommunicationGraph({
  actions = [],
  filters = {},
  nodes = [],
  services = [],
  topics = [],
}) {
  if (filters.viewMode === 'connected') {
    return buildNodeGraph({
      actions,
      filters,
      nodes,
      services,
      topics,
    })
  }

  const entityMaps = {
    action: new Map(actions.map((action) => [action.name, action])),
    service: new Map(services.map((service) => [service.name, service])),
    topic: new Map(topics.map((topic) => [topic.name, topic])),
  }
  const graphNodes = new Map()
  const graphEdges = new Map()
  const connections = new Map()

  for (const node of nodes) {
    if (!shouldShowNode(node, filters)) {
      continue
    }

    ensureGraphNode(graphNodes, connections, {
      entity: node,
      id: entityId('node', node.full_name ?? node.name),
      kind: 'node',
      label: node.full_name ?? node.name,
      status: node.status,
      type: node.namespace,
    })

    if (filters.showTopics !== false) {
      for (const topic of node.topic_publishers ?? []) {
        addEntityEdge({
          connections,
          direction: 'out',
          edgeLabel: 'pub',
          entity: enrichTopic(topic, entityMaps.topic),
          entityKind: 'topic',
          filters,
          fromId: entityId('node', node.full_name ?? node.name),
          graphEdges,
          graphNodes,
          toId: entityId('topic', topic.name),
        })
      }

      for (const topic of node.topic_subscribers ?? []) {
        addEntityEdge({
          connections,
          direction: 'in',
          edgeLabel: 'sub',
          entity: enrichTopic(topic, entityMaps.topic),
          entityKind: 'topic',
          filters,
          fromId: entityId('topic', topic.name),
          graphEdges,
          graphNodes,
          toId: entityId('node', node.full_name ?? node.name),
        })
      }
    }

    if (filters.showServices !== false) {
      for (const service of node.service_clients ?? []) {
        addEntityEdge({
          connections,
          direction: 'out',
          edgeLabel: 'client',
          entity: enrichEntity(service, entityMaps.service),
          entityKind: 'service',
          filters,
          fromId: entityId('node', node.full_name ?? node.name),
          graphEdges,
          graphNodes,
          toId: entityId('service', service.name),
        })
      }

      for (const service of node.service_servers ?? []) {
        addEntityEdge({
          connections,
          direction: 'in',
          edgeLabel: 'server',
          entity: enrichEntity(service, entityMaps.service),
          entityKind: 'service',
          filters,
          fromId: entityId('service', service.name),
          graphEdges,
          graphNodes,
          toId: entityId('node', node.full_name ?? node.name),
        })
      }
    }

    if (filters.showActions !== false) {
      for (const action of node.action_clients ?? []) {
        addEntityEdge({
          connections,
          direction: 'out',
          edgeLabel: 'client',
          entity: enrichEntity(action, entityMaps.action),
          entityKind: 'action',
          filters,
          fromId: entityId('node', node.full_name ?? node.name),
          graphEdges,
          graphNodes,
          toId: entityId('action', action.name),
        })
      }

      for (const action of node.action_servers ?? []) {
        addEntityEdge({
          connections,
          direction: 'in',
          edgeLabel: 'server',
          entity: enrichEntity(action, entityMaps.action),
          entityKind: 'action',
          filters,
          fromId: entityId('action', action.name),
          graphEdges,
          graphNodes,
          toId: entityId('node', node.full_name ?? node.name),
        })
      }
    }
  }

  const searchedNodes = applySearch(graphNodes, graphEdges, filters.search)
  const laidOutNodes = layoutNodes([...searchedNodes.values()], connections)
  const visibleIds = new Set(laidOutNodes.map((node) => node.id))
  const visibleEdges = [...graphEdges.values()].filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  )

  return {
    edges: visibleEdges,
    limited: laidOutNodes.length > 120 || visibleEdges.length > 300,
    mode: 'all',
    nodes: laidOutNodes,
    summary: {
      actionCount: countKind(laidOutNodes, 'action'),
      edgeCount: visibleEdges.length,
      nodeCount: countKind(laidOutNodes, 'node'),
      serviceCount: countKind(laidOutNodes, 'service'),
      topicCount: countKind(laidOutNodes, 'topic'),
    },
  }
}

export function nodeConnectionCount(node) {
  return connectionCount(node)
}

export function isHiddenGraphNode(node) {
  return isInternalNode(node)
}

function buildNodeGraph({
  actions = [],
  filters = {},
  nodes = [],
  services = [],
  topics = [],
}) {
  const selectedNode = nodes.find(
    (node) => (node.full_name ?? node.name) === filters.selectedNodeName,
  )
  if (!selectedNode) {
    return emptyGraph('select_node')
  }

  const entityMaps = {
    action: new Map(actions.map((action) => [action.name, action])),
    service: new Map(services.map((service) => [service.name, service])),
    topic: new Map(topics.map((topic) => [topic.name, topic])),
  }
  const graphNodes = new Map()
  const graphEdges = new Map()
  const connections = new Map()
  const limitState = {
    action: 0,
    edge: 0,
    hidden: false,
    service: 0,
    topic: 0,
  }
  const selectedId = entityId('node', selectedNode.full_name ?? selectedNode.name)

  ensureGraphNode(graphNodes, connections, {
    entity: selectedNode,
    id: selectedId,
    kind: 'node',
    label: selectedNode.full_name ?? selectedNode.name,
    status: selectedNode.status,
    type: selectedNode.namespace,
  })

  if (filters.showTopics !== false) {
    for (const topic of selectedNode.topic_subscribers ?? []) {
      addLimitedNodeEdge({
        bucket: 'topic',
        connections,
        edgeLabel: 'sub',
        entity: enrichTopic(topic, entityMaps.topic),
        entityKind: 'topic',
        filters,
        fromId: entityId('topic', topic.name),
        graphEdges,
        graphNodes,
        limitState,
        toId: selectedId,
      })
    }

    for (const topic of selectedNode.topic_publishers ?? []) {
      addLimitedNodeEdge({
        bucket: 'topic',
        connections,
        edgeLabel: 'pub',
        entity: enrichTopic(topic, entityMaps.topic),
        entityKind: 'topic',
        filters,
        fromId: selectedId,
        graphEdges,
        graphNodes,
        limitState,
        toId: entityId('topic', topic.name),
      })
    }
  }

  if (filters.showServices !== false) {
    for (const service of selectedNode.service_servers ?? []) {
      addLimitedNodeEdge({
        bucket: 'service',
        connections,
        edgeLabel: 'server',
        entity: enrichEntity(service, entityMaps.service),
        entityKind: 'service',
        filters,
        fromId: entityId('service', service.name),
        graphEdges,
        graphNodes,
        limitState,
        toId: selectedId,
      })
    }

    for (const service of selectedNode.service_clients ?? []) {
      addLimitedNodeEdge({
        bucket: 'service',
        connections,
        edgeLabel: 'client',
        entity: enrichEntity(service, entityMaps.service),
        entityKind: 'service',
        filters,
        fromId: selectedId,
        graphEdges,
        graphNodes,
        limitState,
        toId: entityId('service', service.name),
      })
    }
  }

  if (filters.showActions !== false) {
    for (const action of selectedNode.action_servers ?? []) {
      addLimitedNodeEdge({
        bucket: 'action',
        connections,
        edgeLabel: 'server',
        entity: enrichEntity(action, entityMaps.action),
        entityKind: 'action',
        filters,
        fromId: entityId('action', action.name),
        graphEdges,
        graphNodes,
        limitState,
        toId: selectedId,
      })
    }

    for (const action of selectedNode.action_clients ?? []) {
      addLimitedNodeEdge({
        bucket: 'action',
        connections,
        edgeLabel: 'client',
        entity: enrichEntity(action, entityMaps.action),
        entityKind: 'action',
        filters,
        fromId: selectedId,
        graphEdges,
        graphNodes,
        limitState,
        toId: entityId('action', action.name),
      })
    }
  }

  const searchedNodes = applySearch(graphNodes, graphEdges, filters.search)
  const laidOutNodes = layoutNodeView([...searchedNodes.values()], selectedId)
  const visibleIds = new Set(laidOutNodes.map((node) => node.id))
  const visibleEdges = [...graphEdges.values()].filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  )

  return {
    edges: visibleEdges,
    limited: limitState.hidden,
    mode: 'connected',
    nodes: laidOutNodes,
    selectedNode,
    summary: {
      actionClientCount: selectedNode.action_client_count ?? 0,
      actionCount: countKind(laidOutNodes, 'action'),
      actionServerCount: selectedNode.action_server_count ?? 0,
      edgeCount: visibleEdges.length,
      nodeCount: countKind(laidOutNodes, 'node'),
      publishTopicCount: selectedNode.topic_publishers?.length ?? 0,
      serviceClientCount: selectedNode.service_client_count ?? 0,
      serviceCount: countKind(laidOutNodes, 'service'),
      serviceServerCount: selectedNode.service_server_count ?? 0,
      subscribeTopicCount: selectedNode.topic_subscribers?.length ?? 0,
      topicCount: countKind(laidOutNodes, 'topic'),
    },
  }
}

function addLimitedNodeEdge(options) {
  const { bucket, graphEdges, limitState } = options
  if (limitState.edge >= NODE_VIEW_LIMITS.edge) {
    limitState.hidden = true
    return
  }
  if (limitState[bucket] >= NODE_VIEW_LIMITS[bucket]) {
    limitState.hidden = true
    return
  }
  if (!options.entity?.name || !shouldShowEntity(options.entityKind, options.entity, options.filters)) {
    return
  }

  const before = graphEdges.size
  addEntityEdge(options)
  if (graphEdges.size > before) {
    limitState[bucket] += 1
    limitState.edge += 1
  }
}

function emptyGraph(reason) {
  return {
    edges: [],
    emptyReason: reason,
    limited: false,
    mode: 'connected',
    nodes: [],
    summary: {
      actionCount: 0,
      edgeCount: 0,
      nodeCount: 0,
      serviceCount: 0,
      topicCount: 0,
    },
  }
}

function addEntityEdge({
  connections,
  direction,
  edgeLabel,
  entity,
  entityKind,
  filters,
  fromId,
  graphEdges,
  graphNodes,
  toId,
}) {
  if (!entity?.name || !shouldShowEntity(entityKind, entity, filters)) {
    return
  }

  ensureGraphNode(graphNodes, connections, {
    entity,
    id: entityId(entityKind, entity.name),
    kind: entityKind,
    label: entity.name,
    status: entity.status,
    type: entity.type ?? entity.types?.[0],
  })
  addConnection(connections, fromId, toId, edgeLabel, direction)
  const edgeId = `${edgeLabel}:${fromId}->${toId}`
  graphEdges.set(edgeId, {
    animated: edgeLabel === 'pub' || edgeLabel === 'client',
    className: `comm-edge edge-${edgeLabel}`,
    id: edgeId,
    label: edgeLabel,
    source: fromId,
    target: toId,
    type: 'smoothstep',
  })
}

function ensureGraphNode(graphNodes, connections, item) {
  if (!item.id || graphNodes.has(item.id)) {
    return
  }

  connections.set(item.id, {
    incoming: [],
    outgoing: [],
  })
  graphNodes.set(item.id, {
    data: {
      ...item,
      connections: connections.get(item.id),
    },
    id: item.id,
    position: { x: 0, y: 0 },
    type: 'communicationNode',
  })
}

function addConnection(connections, fromId, toId, label, direction) {
  const from = connections.get(fromId)
  const to = connections.get(toId)
  if (!from || !to) {
    return
  }

  from.outgoing.push({ id: toId, label, relation: direction })
  to.incoming.push({ id: fromId, label, relation: direction })
}

function layoutNodes(nodes, connections) {
  const buckets = {
    action: [],
    node: [],
    service: [],
    topic: [],
  }

  for (const node of nodes) {
    buckets[node.data.kind]?.push(node)
  }

  return [
    ...positionBucket(buckets.node, 0, connections),
    ...positionBucket(buckets.topic, 1, connections),
    ...positionBucket(buckets.service, 2, connections),
    ...positionBucket(buckets.action, 3, connections),
  ]
}

function layoutNodeView(nodes, selectedId) {
  const selected = nodes.find((node) => node.id === selectedId)
  const buckets = {
    action: [],
    pubTopic: [],
    service: [],
    subTopic: [],
  }

  for (const node of nodes) {
    if (node.id === selectedId) {
      continue
    }
    if (node.data.kind === 'topic') {
      const incomingToSelected = node.data.connections?.outgoing
        .some((connection) => connection.id === selectedId)
      buckets[incomingToSelected ? 'subTopic' : 'pubTopic'].push(node)
    } else if (node.data.kind === 'service') {
      buckets.service.push(node)
    } else if (node.data.kind === 'action') {
      buckets.action.push(node)
    }
  }

  return [
    ...positionNodeViewBucket(buckets.subTopic, 0, 0),
    selected && {
      ...selected,
      position: { x: 360, y: 170 },
    },
    ...positionNodeViewBucket(buckets.pubTopic, 720, 0),
    ...positionNodeViewBucket(buckets.service, 120, 390),
    ...positionNodeViewBucket(buckets.action, 600, 390),
  ].filter(Boolean)
}

function positionNodeViewBucket(nodes, x, y) {
  return nodes
    .sort((left, right) => String(left.data.label).localeCompare(right.data.label))
    .map((node, index) => ({
      ...node,
      position: {
        x,
        y: y + index * NODE_GAP_Y,
      },
    }))
}

function positionBucket(nodes, columnIndex, connections) {
  return nodes
    .sort((left, right) => scoreNode(right, connections) - scoreNode(left, connections))
    .map((node, index) => ({
      ...node,
      position: {
        x: columnIndex * COLUMN_WIDTH,
        y: index * NODE_GAP_Y,
      },
    }))
}

function scoreNode(node, connections) {
  const entry = connections.get(node.id)
  return (entry?.incoming.length ?? 0) + (entry?.outgoing.length ?? 0)
}

function applySearch(graphNodes, graphEdges, search) {
  const normalized = String(search ?? '').trim().toLowerCase()
  if (!normalized) {
    return graphNodes
  }

  const matchedIds = new Set()
  for (const [id, node] of graphNodes) {
    if (nodeMatches(node, normalized)) {
      matchedIds.add(id)
    }
  }

  for (const edge of graphEdges.values()) {
    if (matchedIds.has(edge.source) || matchedIds.has(edge.target)) {
      matchedIds.add(edge.source)
      matchedIds.add(edge.target)
    }
  }

  return new Map([...graphNodes].filter(([id]) => matchedIds.has(id)))
}

function nodeMatches(node, search) {
  const data = node.data
  return [data.label, data.type, data.status, data.kind]
    .some((value) => String(value ?? '').toLowerCase().includes(search))
}

function shouldShowNode(node, filters) {
  if (!filters.includeHidden && isInternalNode(node)) {
    return false
  }
  if (!filters.activeOnly) {
    return true
  }

  return node.status === 'active' || connectionCount(node) > 0
}

function shouldShowEntity(kind, entity, filters) {
  if (!filters.includeHidden && isHiddenEntity(kind, entity)) {
    return false
  }
  if (!filters.activeOnly) {
    return true
  }

  return isActiveEntity(kind, entity)
}

function isActiveEntity(kind, entity) {
  if (kind === 'topic') {
    return (
      isRegisteredTopic(entity) ||
      entity.status === 'active' ||
      (entity.publisher_count ?? 0) > 0 ||
      (entity.subscriber_count ?? 0) > 0
    )
  }

  return (
    (kind === 'service' && isRegisteredService(entity)) ||
    (kind === 'action' && isRegisteredAction(entity)) ||
    entity.status === 'active' ||
    (entity.server_count ?? 0) > 0 ||
    (entity.client_count ?? 0) > 0
  )
}

function isHiddenEntity(kind, entity) {
  if (kind === 'topic') {
    return (
      INTERNAL_TOPICS.has(entity.name) ||
      entity.name?.endsWith('/_action/status') ||
      entity.name?.endsWith('/_action/feedback') ||
      entity.name?.endsWith('/_service_event')
    )
  }

  return (
    entity.hidden_by_default === true ||
    (entity.category && entity.category !== 'user') ||
    entity.name?.includes('/_action/') ||
    entity.name?.endsWith('/get_type_description') ||
    entity.name?.endsWith('/describe_parameters') ||
    entity.name?.endsWith('/get_parameter_types') ||
    entity.name?.endsWith('/get_parameters') ||
    entity.name?.endsWith('/list_parameters') ||
    entity.name?.endsWith('/set_parameters') ||
    entity.name?.endsWith('/set_parameters_atomically') ||
    entity.name?.endsWith('/change_state') ||
    entity.name?.endsWith('/get_state')
  )
}

function isInternalNode(node) {
  const name = String(node.name ?? '')
  const fullName = String(node.full_name ?? '')
  return name.includes('ros2cli_daemon') || fullName.includes('ros2cli_daemon')
}

function connectionCount(node) {
  return (
    (node.publisher_count ?? 0) +
    (node.subscriber_count ?? 0) +
    (node.service_server_count ?? 0) +
    (node.service_client_count ?? 0) +
    (node.action_server_count ?? 0) +
    (node.action_client_count ?? 0)
  )
}

function enrichTopic(topic, topicMap) {
  return {
    ...topic,
    ...topicMap.get(topic.name),
    name: topic.name,
    type: topic.type ?? topic.types?.[0] ?? topicMap.get(topic.name)?.types?.[0],
  }
}

function enrichEntity(entity, entityMap) {
  return {
    ...entity,
    ...entityMap.get(entity.name),
    name: entity.name,
    type: entity.type ?? entityMap.get(entity.name)?.type,
  }
}

function entityId(kind, name) {
  return `${kind}:${name}`
}

function countKind(nodes, kind) {
  return nodes.filter((node) => node.data.kind === kind).length
}
import {
  isRegisteredAction,
  isRegisteredService,
  isRegisteredTopic,
} from './primaryFilters.js'
