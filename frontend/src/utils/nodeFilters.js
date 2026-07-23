const PRIMARY_NODE_NAMES = new Set([
  '/amcl',
  '/behavior_server',
  '/bt_navigator',
  '/cmd_server',
  '/collision_monitor',
  '/controller_server',
  '/docking_server',
  '/map_server',
  '/planner_server',
  '/robot_state_publisher',
  '/ros_gz_bridge',
  '/route_server',
  '/rviz2',
  '/smoother_server',
  '/status_monitor',
  '/teleop_keyboard',
  '/velocity_smoother',
  '/waypoint_follower',
])

export function isInternalNode(node) {
  const name = String(node.name ?? '')
  const fullName = String(node.full_name ?? '')
  return name.includes('ros2cli_daemon') || fullName.includes('ros2cli_daemon')
}

export function isPrimaryNode(node, topics = []) {
  const fullName = normalizeNodeName(node.full_name ?? node.name)

  if (isHiddenFromPrimary(node, fullName)) {
    return false
  }

  return (
    node.status === 'stale' ||
    PRIMARY_NODE_NAMES.has(fullName) ||
    nodeUsesSupportedTopicType(node, topics)
  )
}

function nodeUsesSupportedTopicType(node, topics) {
  const supportedTypes = new Set(
    topics
      .filter((topic) => topic.supported_type === true)
      .flatMap((topic) => topic.types ?? [topic.type])
      .filter(Boolean),
  )
  if (!supportedTypes.size) {
    return false
  }

  return [
    ...(node.topic_publishers ?? []),
    ...(node.topic_subscribers ?? []),
  ].some((topic) =>
    (topic.types ?? [topic.type]).some((type) => supportedTypes.has(type)),
  )
}

function isHiddenFromPrimary(node, fullName) {
  const namespace = normalizeNodeName(node.namespace ?? '/')

  return (
    fullName.startsWith('/transform_listener_impl_') ||
    fullName.startsWith('/launch_ros_') ||
    fullName.includes('lifecycle_manager') ||
    fullName === '/nav2_container' ||
    fullName.includes('_rclcpp_node') ||
    fullName.includes('_action_client') ||
    fullName === '/ros2_dashboard_topic_monitor' ||
    isInternalNode(node) ||
    (namespace === '/global_costmap' && fullName.includes('global_costmap')) ||
    (namespace === '/local_costmap' && fullName.includes('local_costmap'))
  )
}

function normalizeNodeName(name) {
  const value = String(name ?? '')
  return value.startsWith('/') ? value : `/${value}`
}
