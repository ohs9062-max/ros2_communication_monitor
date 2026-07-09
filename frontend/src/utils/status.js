const WARNING_STATUSES = new Set([
  'warning',
  'stale',
  'no_subscriber',
  'waiting_publisher',
])

const ERROR_STATUSES = new Set(['error', 'critical'])
const INACTIVE_STATUSES = new Set(['inactive', 'unknown', 'unsupported'])

export function getTopicSummary(topics) {
  const summary = {
    total: topics.length,
    active: 0,
    warning: 0,
    error: 0,
    inactive: 0,
    noSubscriber: 0,
    otherWarning: 0,
    unsupported: 0,
    deep: 0,
  }

  for (const topic of topics) {
    const status = String(topic.status || 'unknown').toLowerCase()
    if (status === 'active') {
      summary.active += 1
    } else if (ERROR_STATUSES.has(status)) {
      summary.error += 1
    } else if (WARNING_STATUSES.has(status)) {
      summary.warning += 1
    } else if (INACTIVE_STATUSES.has(status)) {
      summary.inactive += 1
    }

    if (status === 'no_subscriber') {
      summary.noSubscriber += 1
    }

    if (WARNING_STATUSES.has(status) && status !== 'no_subscriber') {
      summary.otherWarning += 1
    }

    if (topic.supported_type === false) {
      summary.unsupported += 1
    }

    if (topic.deep_monitoring) {
      summary.deep += 1
    }
  }

  return summary
}

export function getServiceSummary(services, meta = {}) {
  const total = meta.visible_count ?? meta.count ?? services.length
  const active = meta.active_count ?? countServicesByStatus(services, 'active')
  const warning =
    meta.warning_count ?? countServicesByStatus(services, 'waiting_server')
  const error = meta.error_count ?? countServicesByStatus(services, 'unknown')
  const activeCheckSupported =
    meta.active_check_supported_count ??
    services.filter((service) => service.active_check_supported === true).length
  const inactive = Math.max(total - active - warning - error, 0)

  return {
    total,
    active,
    warning,
    error,
    inactive,
    activeCheckSupported,
  }
}

export function getActionSummary(actions, meta = {}) {
  const total = meta.count ?? actions.length
  const active = meta.active_count ?? countActionsByStatus(actions, 'active')
  const warning =
    meta.warning_count ?? countActionsByStatus(actions, 'waiting_server')
  const error = meta.error_count ?? countActionsByStatus(actions, 'unknown')
  const inactive = Math.max(total - active - warning - error, 0)
  const observedGoals =
    meta.observed_goal_count ??
    actions.reduce(
      (sum, action) =>
        sum + (action.runtime?.observed_goal_count ?? 0),
      0,
    )
  const feedbackSupported =
    meta.feedback_supported_count ??
    actions.filter((action) => action.feedback_supported === true).length
  const resultSupported =
    meta.result_supported_count ??
    actions.filter((action) => action.result_supported === true).length

  return {
    total,
    active,
    warning,
    error,
    inactive,
    observedGoals,
    feedbackSupported,
    resultSupported,
  }
}

function countServicesByStatus(services, expectedStatus) {
  return services.filter(
    (service) =>
      String(service.status || 'unknown').toLowerCase() === expectedStatus,
  ).length
}

function countActionsByStatus(actions, expectedStatus) {
  return actions.filter(
    (action) =>
      String(action.status || 'unknown').toLowerCase() === expectedStatus,
  ).length
}

export function topicSeverity(topic) {
  const status = String(topic.status || 'unknown').toLowerCase()
  if (ERROR_STATUSES.has(status)) {
    return 0
  }
  if (WARNING_STATUSES.has(status)) {
    return 1
  }
  if (INACTIVE_STATUSES.has(status) || topic.supported_type === false) {
    return 2
  }
  return 3
}

export function sortTopicsByHealth(topics) {
  return [...topics].sort((a, b) => {
    const severity = topicSeverity(a) - topicSeverity(b)
    if (severity !== 0) {
      return severity
    }
    return String(a.name).localeCompare(String(b.name))
  })
}

export function matchesStatusFilter(topic, filter) {
  const status = String(topic.status || 'unknown').toLowerCase()
  if (filter === 'all') {
    return true
  }
  if (filter === 'warning') {
    return WARNING_STATUSES.has(status)
  }
  if (filter === 'error') {
    return ERROR_STATUSES.has(status)
  }
  if (filter === 'unsupported') {
    return topic.supported_type === false
  }
  if (filter === 'no_subscriber') {
    return status === 'no_subscriber'
  }
  return status === filter
}

export function matchesServiceStatusFilter(service, filter) {
  const status = String(service.status || 'unknown').toLowerCase()
  if (filter === 'all') {
    return true
  }
  if (filter === 'warning') {
    return status === 'waiting_server' || status === 'warning'
  }
  if (filter === 'error') {
    return status === 'unknown' || status === 'error' || status === 'critical'
  }
  if (filter === 'unsupported') {
    return (
      service.active_check_supported === false ||
      service.supported_type === false
    )
  }
  return status === filter
}

export function overallStatus(alertMeta) {
  if ((alertMeta?.critical_count ?? 0) > 0 || (alertMeta?.error_count ?? 0) > 0) {
    return 'error'
  }
  if ((alertMeta?.warning_count ?? 0) > 0) {
    return 'warning'
  }
  return 'active'
}
