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
import { sortTopicsByHealth } from '../utils/status.js'
import { usePolling } from './usePolling.js'

const POLL_INTERVAL_MS = 1000
const NODE_POLL_INTERVAL_MS = 3000

export function useTopicDashboard() {
  const [includeAllTopics, setIncludeAllTopics] = useState(false)
  const [selectedTopicName, setSelectedTopicName] = useState('')
  const [topicHzByName, setTopicHzByName] = useState({})

  const health = usePolling(fetchHealth, POLL_INTERVAL_MS)
  const topics = usePolling(fetchTopics, POLL_INTERVAL_MS, {
    initialData: { data: [], meta: {} },
  })
  const alerts = usePolling(fetchAlerts, POLL_INTERVAL_MS, {
    initialData: { data: [], meta: {} },
  })
  const nodeState = usePolling(fetchNodes, NODE_POLL_INTERVAL_MS, {
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
    enabled: Boolean(selectedTopicName),
  })
  const hz = usePolling(hzFetcher, POLL_INTERVAL_MS, {
    enabled: Boolean(selectedTopicName),
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
  const defaultTopicName = useMemo(
    () => {
      const sortedTopics = sortTopicsByHealth(topicItems)
      return (
        sortedTopics.find((topic) => topic.deep_monitoring)?.name ??
        sortedTopics[0]?.name ??
        ''
      )
    },
    [topicItems],
  )
  const hzTopicNames = useMemo(
    () =>
      topicItems
        .filter((topic) => topic.deep_monitoring)
        .map((topic) => topic.name),
    [topicItems],
  )

  useEffect(() => {
    if (selectedTopicName && selectedTopic) {
      return
    }

    setSelectedTopicName(defaultTopicName)
  }, [defaultTopicName, selectedTopic, selectedTopicName])

  useEffect(() => {
    if (!hzTopicNames.length) {
      setTopicHzByName({})
      return undefined
    }

    let cancelled = false

    async function pollTopicHz() {
      const results = await Promise.allSettled(
        hzTopicNames.map(async (name) => [name, await fetchTopicHz(name)]),
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
    }

    pollTopicHz()
    const timer = window.setInterval(pollTopicHz, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [hzTopicNames])

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
