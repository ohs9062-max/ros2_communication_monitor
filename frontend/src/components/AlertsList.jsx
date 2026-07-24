import { useMemo, useState } from 'react'
import { formatTime } from '../utils/format.js'
import { nextSortState, sortRows } from '../utils/sort.js'
import { SortableHeader } from './SortableHeader.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const ALERT_SORT_COLUMNS = {
  level: { value: (alert) => alert.level },
  source: { value: (alert) => alert.source },
  name: { value: (alert) => alert.name },
  message: { value: (alert) => alert.message },
  code: { value: (alert) => alert.code },
  detected_at: {
    defaultDirection: 'desc',
    value: (alert) => alert.resolved_at ?? alert.detected_at,
  },
}

export function AlertsList({
  alerts,
  emptyMessage = '현재 Alert가 없습니다',
  onAlertClick,
  timeLabel = '시간',
}) {
  const [sort, setSort] = useState({ key: 'detected_at', direction: 'desc' })
  const sortedAlerts = useMemo(
    () => sortRows(alerts, sort, ALERT_SORT_COLUMNS),
    [alerts, sort],
  )
  const onSort = (key) => setSort((current) =>
    nextSortState(current, key, ALERT_SORT_COLUMNS),
  )

  if (!alerts.length) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="table-wrap">
      <table className="topic-table">
        <thead>
          <tr>
            <SortableHeader columnKey="level" label="레벨" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="source" label="출처" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="name" label="이름" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="message" label="메시지" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="code" label="코드" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="detected_at" label={timeLabel} onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedAlerts.map((alert) => (
            <tr
              key={alert.id}
              onClick={() => onAlertClick?.(alert)}
            >
              <td>
                <StatusBadge
                  value={
                    alert.alert_state === 'resolved'
                      ? 'resolved'
                      : alert.level
                  }
                />
              </td>
              <td>{alert.source}</td>
              <td className="topic-name">{alert.name}</td>
              <td>{alert.message}</td>
              <td>{alert.code}</td>
              <td>{formatTime(alert.resolved_at ?? alert.detected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
