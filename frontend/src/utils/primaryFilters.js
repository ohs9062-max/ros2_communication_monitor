const IMPORTANT_TOPIC_NAMES = new Set([
  '/cmd_vel',
  '/odom',
  '/imu',
  '/joint_states',
  '/scan',
])

const INTERNAL_TOPIC_NAMES = new Set([
  '/clock',
  '/parameter_events',
  '/rosout',
  '/tf',
  '/tf_static',
])

export function isRegisteredTopic(topic) {
  return topic?.supported_type === true
}

export function isRegisteredService(service) {
  return service?.allowlisted === true
}

export function isRegisteredAction(action) {
  return action?.allowlisted === true
}

export function isPrimaryTopic(topic, hzEntry) {
  if (isInternalTopic(topic?.name)) {
    return false
  }

  const hzData = hzEntry?.data
  const hz = Number(hzData?.hz)
  const messageCount = Number(
    hzData?.message_count ?? topic?.message_count ?? topic?.received_count ?? 0,
  )
  const hasPreview = Boolean(
    topic?.message_preview ?? topic?.latest_message ?? topic?.preview,
  )

  return (
    isRegisteredTopic(topic) ||
    topic?.status === 'active' ||
    IMPORTANT_TOPIC_NAMES.has(topic?.name) ||
    topic?.received === true ||
    hzData?.received === true ||
    messageCount > 0 ||
    (Number.isFinite(hz) && hz > 0) ||
    (
      (topic?.external_subscriber_count ?? 0) > 0 &&
      (topic?.publisher_count ?? 0) > 0
    ) ||
    topic?.detailed_monitoring === true ||
    topic?.deep_monitoring === true ||
    hasPreview
  )
}

export function isPrimaryAction(action) {
  const runtime = action?.runtime ?? {}
  const observedGoalCount =
    Number(runtime.observed_goal_count ?? action?.observed_goal_count ?? 0)
  const lastGoalStatus = String(
    runtime.last_goal_status ?? action?.last_goal_status ?? '',
  ).toLowerCase()

  return (
    isRegisteredAction(action) ||
    observedGoalCount > 0 ||
    Boolean(lastGoalStatus && lastGoalStatus !== 'unknown') ||
    Boolean(runtime.feedback_preview) ||
    Boolean(runtime.result_preview) ||
    Boolean(runtime.result_status) ||
    Boolean(runtime.result_error)
  )
}

function isInternalTopic(name = '') {
  return (
    INTERNAL_TOPIC_NAMES.has(name) ||
    name.endsWith('/_action/status') ||
    name.endsWith('/_action/feedback') ||
    name.endsWith('/_service_event')
  )
}
