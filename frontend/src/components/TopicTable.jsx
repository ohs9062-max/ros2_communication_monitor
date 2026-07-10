import { useMemo, useState } from 'react'
import { formatTime } from '../utils/format.js'
import { nextSortState, sortRows } from '../utils/sort.js'
import { SortableHeader } from './SortableHeader.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const TOPIC_SORT_COLUMNS = {
  status: { value: (topic) => topic.status },
  name: { value: (topic) => topic.name },
  type: { value: (topic) => topic.types?.[0] },
  publisher_count: {
    defaultDirection: 'desc',
    value: (topic) => topic.publisher_count,
  },
  subscriber_count: {
    defaultDirection: 'desc',
    value: (topic) => topic.subscriber_count,
  },
  external_subscriber_count: {
    defaultDirection: 'desc',
    value: (topic) =>
      topic.external_subscriber_count ?? topic.subscriber_count,
  },
  hz: {
    defaultDirection: 'desc',
    value: (topic, context) => context.hzByTopic[topic.name]?.data?.hz,
  },
  deep_monitoring: {
    defaultDirection: 'desc',
    value: (topic) => (topic.deep_monitoring ? 1 : 0),
  },
  last_updated: {
    defaultDirection: 'desc',
    value: (topic) => topic.last_updated,
  },
}

export function TopicTable({
  topics,
  emptyMessage = '표시할 Topic이 없습니다',
  selectedTopicName,
  onSelectTopic,
  hzByTopic = {},
}) {
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const sortedTopics = useMemo(
    () =>
      sortRows(
        topics,
        sort,
        withSortContext(TOPIC_SORT_COLUMNS, { hzByTopic }),
      ),
    [hzByTopic, sort, topics],
  )
  const onSort = (key) => setSort((current) =>
    nextSortState(current, key, TOPIC_SORT_COLUMNS),
  )

  if (!topics.length) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="table-wrap">
      <table className="topic-table">
        <thead>
          <tr>
            <SortableHeader columnKey="status" label="상태" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="name" label="이름" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="type" label="타입" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="publisher_count" label="발행" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="subscriber_count" label="구독" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="external_subscriber_count" label="외부 구독" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="hz" label="Hz" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="deep_monitoring" label="상세 감시" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="last_updated" label="마지막 확인" onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedTopics.map((topic) => {
            const selected = topic.name === selectedTopicName
            const hz = hzByTopic[topic.name]
            const missing = isMissingTopic(topic, hz)
            return (
              <tr
                className={[
                  selected ? 'selected' : '',
                  missing ? 'message-missing' : '',
                ].join(' ')}
                data-monitor-name={topic.name}
                key={topic.name}
                onClick={() => onSelectTopic(topic.name)}
              >
                <td>
                  <StatusBadge value={topic.status} />
                </td>
                <td className="topic-name">{topic.name}</td>
                <td className="topic-type">{topic.types?.[0] ?? '-'}</td>
                <td>{topic.publisher_count ?? 0}</td>
                <td>{topic.subscriber_count ?? 0}</td>
                <td>
                  {topic.external_subscriber_count ??
                    topic.subscriber_count ??
                    0}
                </td>
                <td>
                  <HzBadge hzData={hz?.data} topic={topic} />
                </td>
                <td>{topic.deep_monitoring ? '예' : '아니오'}</td>
                <td>{formatTime(topic.last_updated)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HzBadge({ hzData, topic }) {
  const state = hzState(hzData, topic)
  const label = hzLabel(hzData, state)

  return <span className={`hz-badge ${state}`}>{label}</span>
}

function hzState(hzData, topic) {
  if (!topic.deep_monitoring) {
    return 'unsupported'
  }

  if (!hzData || hzData.status === 'never_received') {
    return 'never'
  }

  const hz = Number(hzData.hz ?? 0)
  if (!Number.isFinite(hz) || hz <= 0) {
    return 'zero'
  }

  if (hz < 10) {
    return 'low'
  }

  return 'normal'
}

function hzLabel(hzData, state) {
  if (state === 'unsupported') {
    return '미지원'
  }

  if (state === 'never') {
    return '아직 수신 없음'
  }

  const hz = Number(hzData?.hz ?? 0)
  return `${hz.toFixed(2)} Hz`
}

function isMissingTopic(topic, hzEntry) {
  return (
    topic.deep_monitoring === true &&
    (
      hzEntry?.data?.status === 'never_received' ||
      hzEntry?.data?.received === false
    )
  )
}

function withSortContext(columns, context) {
  return Object.fromEntries(
    Object.entries(columns).map(([key, column]) => [
      key,
      {
        ...column,
        value: (row) => column.value(row, context),
      },
    ]),
  )
}
