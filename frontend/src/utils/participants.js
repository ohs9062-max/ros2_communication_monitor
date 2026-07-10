export function buildParticipantMaps(nodes = []) {
  const topicParticipants = {}
  const serviceParticipants = {}
  const actionParticipants = {}

  for (const node of nodes) {
    const nodeName = node.full_name || node.name
    if (!nodeName) {
      continue
    }

    addParticipants(
      topicParticipants,
      node.topic_publishers,
      'publishers',
      nodeName,
    )
    addParticipants(
      topicParticipants,
      node.topic_subscribers,
      'subscribers',
      nodeName,
    )
    addParticipants(
      serviceParticipants,
      node.service_servers,
      'servers',
      nodeName,
    )
    addParticipants(
      serviceParticipants,
      node.service_clients,
      'clients',
      nodeName,
    )
    addParticipants(
      actionParticipants,
      node.action_servers,
      'servers',
      nodeName,
    )
    addParticipants(
      actionParticipants,
      node.action_clients,
      'clients',
      nodeName,
    )
  }

  return {
    actionParticipants: normalizeParticipantMap(actionParticipants),
    serviceParticipants: normalizeParticipantMap(serviceParticipants),
    topicParticipants: normalizeParticipantMap(topicParticipants),
  }
}

function addParticipants(map, entities = [], role, nodeName) {
  for (const entity of entities ?? []) {
    const entityName = entityNameOf(entity)
    if (!entityName) {
      continue
    }

    map[entityName] ??= {}
    map[entityName][role] ??= new Set()
    map[entityName][role].add(nodeName)
  }
}

function entityNameOf(entity) {
  if (typeof entity === 'string') {
    return entity
  }
  return entity?.name
}

function normalizeParticipantMap(map) {
  const normalized = {}
  for (const [name, roles] of Object.entries(map)) {
    normalized[name] = Object.fromEntries(
      Object.entries(roles).map(([role, values]) => [
        role,
        [...values].sort((left, right) => left.localeCompare(right)),
      ]),
    )
  }
  return normalized
}
