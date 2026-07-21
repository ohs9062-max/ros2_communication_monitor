import { useEffect, useMemo, useState } from 'react'
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
  const [statusFilter, setStatusFilter] = useState('primary')
  const {
    alerts,
    health,
    hz,
    includeAllTopics,
    latest,
    selectedTopic,
    selectedTopicName,
    setIncludeAllTopics,
    setSelectedTopicName,
    topicHzByName,
    topicItems,
    topicParticipants,
    topics,
  } = dashboard

  const summary = getTopicSummary(topicItems)
  const activeTopics = useMemo(
    () =>
      topicItems.filter((topic) =>
        isActiveTopic(topic, topicHzByName[topic.name]),
      ),
    [topicItems, topicHzByName],
  )
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
    const baseTopics = includeAllTopics || statusFilter !== 'primary'
      ? topicItems
      : activeTopics
    return sortTopicsByHealth(baseTopics).filter((topic) => {
      const type = topic.types?.[0] ?? ''
      const matchesSearch =
        !normalizedSearch ||
        topic.name.toLowerCase().includes(normalizedSearch) ||
        type.toLowerCase().includes(normalizedSearch)
      const matchesStatus =
        statusFilter === 'primary' || statusFilter === 'all'
          ? true
          : statusFilter === 'waiting'
            ? isWaitingTopic(topic)
            : statusFilter === 'missing'
              ? isTopicMissingMessages(topic, topicHzByName[topic.name])
              : matchesStatusFilter(topic, statusFilter)
      return (
        matchesSearch &&
        matchesStatus
      )
    })
  }, [activeTopics, includeAllTopics, search, statusFilter, topicHzByName, topicItems])

  useEffect(() => {
    if (filteredTopics.some((topic) => topic.name === selectedTopicName)) {
      return
    }

    const nextTopicName = filteredTopics[0]?.name ?? ''
    if (nextTopicName !== selectedTopicName) {
      setSelectedTopicName(nextTopicName)
    }
  }, [filteredTopics, selectedTopicName, setSelectedTopicName])

  const detailTopic = filteredTopics.some(
    (topic) => topic.name === selectedTopicName,
  )
    ? selectedTopic
    : null
  const openTopicAlert = (alert) => {
    setIncludeAllTopics(true)
    setSearch('')
    setStatusFilter('all')
    setSelectedTopicName(alert.name)
    focusMonitorRow(alert.name, setSelectedTopicName)
  }

  return (
    <main className="topics-page">
      <section className="main-panel">
        <div className="summary-grid">
          <SummaryCard label="전체 Topic" value={summary.total} />
          <SummaryCard label="활동 Topic" value={activeTopics.length} tone="good" />
          <SummaryCard label="정상" value={summary.active} tone="good" />
          <SummaryCard label="상세 감시" value={summary.deep} />
          <SummaryCard
            label="주의/오류"
            value={warningCount + errorCount}
            tone={warningCount + errorCount ? 'warn' : 'default'}
          />
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
          onAlertClick={openTopicAlert}
          title="Topic Alert"
        />

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <h2>Topic 상세</h2>
              <p className="muted">
                기본 화면은 현재 활동 중이거나 최근 상태 변화가 관찰된 Topic만
                표시합니다.
              </p>
            </div>
            {topics.error && <span className="error-text">{topics.error}</span>}
            {health.error && (
              <span className="error-text">백엔드 연결 끊김</span>
            )}
          </div>
          <FilterToolbar
            includeAllTopics={includeAllTopics}
            onIncludeAllTopicsChange={setIncludeAllTopics}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            search={search}
            statusFilter={statusFilter}
          />
          <p className="topic-filter-help">
            구독자 없음은 현재 해당 Topic을 받는 외부 Node가 없다는 뜻입니다.
            센서 출력, 로그, 이벤트성 Topic에서는 장애가 아닐 수 있습니다.
          </p>
          <TopicTable
            emptyMessage={
              includeAllTopics
                ? '표시할 Topic이 없습니다'
                : "현재 활동 중인 Topic이 없습니다. 숨김 Topic을 보려면 '숨김 Topic 포함'을 켜세요."
            }
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
        participants={topicParticipants[detailTopic?.name] ?? null}
        topic={detailTopic}
      />
    </main>
  )
}

function focusMonitorRow(name, select) {
  window.setTimeout(() => focusMonitorRowAttempt(name, select, 0), 50)
}

function focusMonitorRowAttempt(name, select, attempt) {
  select(name)
  const row = findMonitorRow(name)
  if (row) {
    row.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    return
  }

  if (attempt < 6) {
    window.setTimeout(() => focusMonitorRowAttempt(name, select, attempt + 1), 80)
  }
}

function findMonitorRow(name) {
  return [...document.querySelectorAll('[data-monitor-name]')].find(
    (row) => row.getAttribute('data-monitor-name') === name,
  )
}

const INTERNAL_TOPIC_NAMES = new Set([
  '/clock',
  '/parameter_events',
  '/rosout',
  '/tf',
  '/tf_static',
])

const IMPORTANT_TOPIC_NAMES = new Set([
  '/cmd_vel',
  '/odom',
  '/imu',
  '/joint_states',
  '/scan',
])

function isInternalTopic(name) {
  return (
    INTERNAL_TOPIC_NAMES.has(name) ||
    name.endsWith('/_action/status') ||
    name.endsWith('/_action/feedback') ||
    name.endsWith('/_service_event')
  )
}

function isActiveTopic(topic, hzEntry) {
  if (isInternalTopic(topic.name)) {
    return false
  }

  const hzData = hzEntry?.data
  const hz = Number(hzData?.hz)
  const messageCount = Number(
    hzData?.message_count ?? topic.message_count ?? topic.received_count ?? 0,
  )
  const hasPreview = Boolean(
    topic.message_preview ?? topic.latest_message ?? topic.preview,
  )

  return (
    topic.status === 'active' ||
    IMPORTANT_TOPIC_NAMES.has(topic.name) ||
    topic.received === true ||
    hzData?.received === true ||
    messageCount > 0 ||
    (Number.isFinite(hz) && hz > 0) ||
    (
      (topic.external_subscriber_count ?? 0) > 0 &&
      (topic.publisher_count ?? 0) > 0
    ) ||
    topic.detailed_monitoring === true ||
    topic.deep_monitoring === true ||
    hasPreview
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

function isWaitingTopic(topic) {
  return ['waiting_publisher', 'no_subscriber'].includes(
    String(topic.status || '').toLowerCase(),
  )
}
