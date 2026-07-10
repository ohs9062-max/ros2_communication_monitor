import { useMemo, useState } from 'react'
import { formatMs, formatRelativeTime } from '../utils/format.js'
import { nextSortState, sortRows } from '../utils/sort.js'
import { SortableHeader } from './SortableHeader.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const SERVICE_SORT_COLUMNS = {
  status: { value: (service) => service.status },
  name: { value: (service) => service.name },
  type: { value: (service) => service.type },
  category: { value: (service) => service.category },
  server_count: {
    defaultDirection: 'desc',
    value: (service) => service.server_count,
  },
  client_count: {
    defaultDirection: 'desc',
    value: (service) => service.client_count,
  },
  active_check: { value: (service) => activeCheckLabel(service) },
  response_time: {
    defaultDirection: 'desc',
    value: (service) => service.active_check?.last_response_time_ms,
  },
  last_checked: {
    defaultDirection: 'desc',
    value: (service) => service.active_check?.last_checked_at,
  },
  hidden: {
    defaultDirection: 'desc',
    value: (service) => (service.hidden_by_default ? 1 : 0),
  },
}

export function ServiceTable({
  emptyMessage = '표시할 Service가 없습니다',
  onSelectService,
  selectedServiceName,
  services,
}) {
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const sortedServices = useMemo(
    () => sortRows(services, sort, SERVICE_SORT_COLUMNS),
    [services, sort],
  )
  const onSort = (key) => setSort((current) =>
    nextSortState(current, key, SERVICE_SORT_COLUMNS),
  )

  if (!services.length) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="table-wrap">
      <table className="topic-table service-table">
        <thead>
          <tr>
            <SortableHeader columnKey="status" label="상태" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="name" label="이름" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="type" label="타입" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="category" label="분류" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="server_count" label="서버" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="client_count" label="클라이언트" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="active_check" label="응답 측정" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="response_time" label="응답 시간" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="last_checked" label="마지막 측정" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="hidden" label="숨김" onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedServices.map((service) => {
            const activeCheck = service.active_check ?? {}
            const selected = service.name === selectedServiceName
            return (
              <tr
                className={selected ? 'selected' : ''}
                data-monitor-name={service.name}
                key={service.name}
                onClick={() => onSelectService(service.name)}
              >
                <td>
                  <StatusBadge value={service.status} />
                </td>
                <td className="topic-name service-name">{service.name}</td>
                <td className="topic-type service-type">{service.type ?? '-'}</td>
                <td>
                  <StatusBadge value={service.category} />
                </td>
                <td>{service.server_count ?? 0}</td>
                <td>{service.client_count ?? 0}</td>
                <td>
                  <ActiveCheckBadge service={service} />
                </td>
                <td>{formatMs(activeCheck.last_response_time_ms)}</td>
                <td>{formatRelativeTime(activeCheck.last_checked_at)}</td>
                <td>{service.hidden_by_default ? '예' : '아니오'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ActiveCheckBadge({ service }) {
  if (service.active_check_supported === false) {
    return <StatusBadge label="상태만 표시" value="not_supported" />
  }

  return <StatusBadge value={service.active_check?.last_status ?? 'unknown'} />
}

function activeCheckLabel(service) {
  if (service.active_check_supported === false) {
    return 'not_supported'
  }

  return service.active_check?.last_status ?? 'unknown'
}
