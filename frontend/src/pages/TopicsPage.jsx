import { useMemo, useState } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { FilterToolbar } from '../components/FilterToolbar.jsx'
import { SummaryCard } from '../components/SummaryCard.jsx'
import { TopicDetailPanel } from '../components/TopicDetailPanel.jsx'
import { TopicTable } from '../components/TopicTable.jsx'
import {
  getTopicSummary,
  matchesStatusFilter,
  sortTopicsByHealth,
} from '../utils/status.js'

export function TopicsPage({ dashboard }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [includeInternalTopics, setIncludeInternalTopics] = useState(false)
  const {
    alerts,
    health,
    hz,
    latest,
    selectedTopic,
    selectedTopicName,
    setSelectedTopicName,
    topicHzByName,
    topicItems,
    topics,
  } = dashboard

  const summary = getTopicSummary(topicItems)
  const warningCount = alerts.data?.meta?.warning_count ?? 0
  const errorCount =
    (alerts.data?.meta?.error_count ?? 0) +
    (alerts.data?.meta?.critical_count ?? 0)
  const missedCount = useMemo(
    () =>
      topicItems.filter((topic) =>
        isTopicMissingMessages(topic, topicHzByName[topic.name]),
      ).length,
    [topicItems, topicHzByName],
  )
  const topicAlerts = useMemo(
    () =>
      (alerts.data?.data ?? []).filter((alert) =>
        ['topic', 'monitor_status'].includes(alert.source),
      ),
    [alerts.data],
  )
  const filteredTopics = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return sortTopicsByHealth(topicItems).filter((topic) => {
      const type = topic.types?.[0] ?? ''
      const isInternal = isInternalTopic(topic.name)
      const matchesSearch =
        !normalizedSearch ||
        topic.name.toLowerCase().includes(normalizedSearch) ||
        type.toLowerCase().includes(normalizedSearch)
      const matchesStatus =
        statusFilter === 'missing'
          ? isTopicMissingMessages(topic, topicHzByName[topic.name])
          : matchesStatusFilter(topic, statusFilter)
      return (
        matchesSearch &&
        matchesStatus &&
        (includeInternalTopics || !isInternal)
      )
    })
  }, [includeInternalTopics, search, statusFilter, topicHzByName, topicItems])
  return (
    <main className="topics-page">
      <section className="main-panel">
        <div className="summary-grid">
          <SummaryCard label="Topic" value={summary.total} />
          <SummaryCard label="정상" value={summary.active} tone="good" />
          <SummaryCard label="상세 감시" value={summary.deep} />
          <SummaryCard label="주의" value={warningCount} tone="warn" />
          <SummaryCard label="오류" value={errorCount} tone="bad" />
          <SummaryCard
            label="미수신"
            tone={missedCount ? 'bad' : 'default'}
            value={missedCount}
          />
        </div>

        <AlertsPreview
          alerts={topicAlerts}
          emptyMessage="Topic 알림 없음"
          error={alerts.error}
          title="Topic Alert"
        />

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <h2>Topic 상세</h2>
              <p className="muted">1초마다 자동 갱신</p>
            </div>
            {topics.error && <span className="error-text">{topics.error}</span>}
            {health.error && (
              <span className="error-text">백엔드 연결 끊김</span>
            )}
          </div>
          <FilterToolbar
            includeInternalTopics={includeInternalTopics}
            onIncludeInternalTopicsChange={setIncludeInternalTopics}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            search={search}
            statusFilter={statusFilter}
          />
          <TopicTable
            hzByTopic={topicHzByName}
            onSelectTopic={setSelectedTopicName}
            selectedTopicName={selectedTopicName}
            topics={filteredTopics}
          />
        </section>
      </section>

      <TopicDetailPanel
        hz={hz}
        latest={latest}
        topic={selectedTopic}
      />
    </main>
  )
}

const INTERNAL_TOPIC_NAMES = new Set([
  '/clock',
  '/parameter_events',
  '/rosout',
  '/tf',
  '/tf_static',
])

function isInternalTopic(name) {
  return (
    INTERNAL_TOPIC_NAMES.has(name) ||
    name.endsWith('/_action/status') ||
    name.endsWith('/_action/feedback') ||
    name.endsWith('/_service_event')
  )
}

function isTopicMissingMessages(topic, hzEntry) {
  const hzStatus = hzEntry?.data?.status
  return (
    hzStatus === 'never_received' ||
    (
      topic.deep_monitoring === true &&
      topic.publisher_count > 0 &&
      hzEntry?.data?.received === false
    )
  )
}
