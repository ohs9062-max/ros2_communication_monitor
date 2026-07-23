export function topicHasType(topic, fullType) {
  const types = Array.isArray(topic?.types)
    ? topic.types
    : Array.isArray(topic?.type)
      ? topic.type
      : [topic?.type]
  return types.includes(fullType)
}

export function isActionInternalTopic(topicName = '') {
  return topicName.includes('/_action/') || topicName.endsWith('/_action')
}

export function graphPublishTopicCandidates(topics = [], fullType = '') {
  if (!fullType) return []
  return topics.filter((topic) =>
    !isActionInternalTopic(topic?.name)
      && topicHasType(topic, fullType))
}

export function topicNameTypeWarning(topics = [], topicName = '', fullType = '') {
  const normalizedName = topicName.trim()
  if (!normalizedName || !fullType) return null
  if (isActionInternalTopic(normalizedName)) {
    return 'Action 내부 Topic은 Interface Lab의 일반 Message Publish에서 사용할 수 없습니다.'
  }
  const sameNameTopics = topics.filter((topic) => topic?.name === normalizedName)
  if (sameNameTopics.some((topic) => !topicHasType(topic, fullType))) {
    return '같은 Topic 이름에 다른 Message type이 Graph에 있습니다. 이 조합은 Publish할 수 없습니다.'
  }
  return null
}
