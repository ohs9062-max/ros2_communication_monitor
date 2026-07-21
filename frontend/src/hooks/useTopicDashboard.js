import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAlerts,
  fetchHealth,
  fetchNodes,
  fetchTopicHz,
  fetchTopicLatest,
  fetchTopics,
} from '../api/rosApi.js'
import { buildParticipantMaps } from '../utils/participants.js'
import { usePolling } from './usePolling.js'

const POLL_INTERVAL_MS = 1000
const NODE_POLL_INTERVAL_MS = 3000

export function useTopicDashboard({
  enabled = true,
  pollSelectedTopicDetails = true,
} = {}) {
  const [includeAllTopics, setIncludeAllTopics] = useState(false)
  const [selectedTopicName, setSelectedTopicName] = useState('')
  const [topicHzByName, setTopicHzByName] = useState({})

  const health = usePolling(fetchHealth, POLL_INTERVAL_MS, { enabled })
  const topics = usePolling(fetchTopics, POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: [], meta: {} },
  })
  const alerts = usePolling(fetchAlerts, POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: [], meta: {} },
  })
  const nodeState = usePolling(fetchNodes, NODE_POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: { nodes: [], meta: {} } },
  })

  const latestFetcher = useCallback(
    () => fetchTopicLatest(selectedTopicName),
    [selectedTopicName],
  )
  const hzFetcher = useCallback(
    () => fetchTopicHz(selectedTopicName),
    [selectedTopicName],
  )

  const latest = usePolling(latestFetcher, POLL_INTERVAL_MS, {
    enabled: enabled && pollSelectedTopicDetails && Boolean(selectedTopicName),
    resetKey: selectedTopicName,
  })
  const hz = usePolling(hzFetcher, POLL_INTERVAL_MS, {
    enabled: enabled && pollSelectedTopicDetails && Boolean(selectedTopicName),
    resetKey: selectedTopicName,
  })

  const topicItems = useMemo(() => topics.data?.data ?? [], [topics.data])
  const nodeItems = useMemo(
    () => nodeState.data?.data?.nodes ?? [],
    [nodeState.data],
  )
  const { topicParticipants } = useMemo(
    () => buildParticipantMaps(nodeItems),
    [nodeItems],
  )
  const selectedTopic = useMemo(
    () => topicItems.find((topic) => topic.name === selectedTopicName) ?? null,
    [selectedTopicName, topicItems],
  )
  const hzTopicNames = useMemo(
    () =>
      Array.from(new Set(topicItems
        .filter(isTopicDetailCandidate)
        .filter((topic) => topic.deep_monitoring)
        .map((topic) => topic.name)
        .filter((name) => name && name !== selectedTopicName))).sort(),
    [selectedTopicName, topicItems],
  )
  const hzTopicNamesKey = useMemo(() => hzTopicNames.join('\n'), [hzTopicNames])

  useEffect(() => {
    const names = hzTopicNamesKey ? hzTopicNamesKey.split('\n') : []
    if (!names.length) {
      setTopicHzByName({})
      return undefined
    }

    let cancelled = false
    let pollInFlight = false

    async function pollTopicHz() {
      if (pollInFlight) {
        return
      }

      pollInFlight = true
      try {
        const results = await Promise.allSettled(
          names.map(async (name) => [name, await fetchTopicHz(name)]),
        )

        if (cancelled) {
          return
        }

        const nextHzByName = {}
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const [name, data] = result.value
            nextHzByName[name] = data
          }
        }

        setTopicHzByName(nextHzByName)
      } finally {
        pollInFlight = false
      }
    }

    pollTopicHz()
    const timer = window.setInterval(pollTopicHz, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [hzTopicNamesKey])

  const lastUpdated =
    topics.lastUpdated ??
    nodeState.lastUpdated ??
    alerts.lastUpdated ??
    health.lastUpdated

  return {
    alerts,
    health,
    hz,
    includeAllTopics,
    latest,
    lastUpdated,
    selectedTopic,
    selectedTopicName,
    setIncludeAllTopics,
    setSelectedTopicName,
    topicHzByName,
    topicItems,
    topicParticipants,
    topics,
  }
}

function isTopicDetailCandidate(topic) {
  const name = topic?.name ?? ''
  return !(
    name === '/clock' ||
    name === '/parameter_events' ||
    name === '/rosout' ||
    name === '/tf' ||
    name === '/tf_static' ||
    name.endsWith('/_action/status') ||
    name.endsWith('/_action/feedback') ||
    name.endsWith('/_service_event')
  )
}
