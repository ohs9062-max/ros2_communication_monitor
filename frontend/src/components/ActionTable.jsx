import { useMemo, useState } from 'react'
import { formatMs } from '../utils/format.js'
import { nextSortState, sortRows } from '../utils/sort.js'
import { SortableHeader } from './SortableHeader.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const ACTION_SORT_COLUMNS = {
  status: { value: (action) => action.status },
  name: { value: (action) => action.name },
  type: { value: (action) => action.type },
  server_count: {
    defaultDirection: 'desc',
    value: (action) => action.server_count,
  },
  client_count: {
    defaultDirection: 'desc',
    value: (action) => action.client_count,
  },
  last_goal_status: { value: (action) => action.runtime?.last_goal_status },
  feedback_supported: {
    defaultDirection: 'desc',
    value: (action) => (action.feedback_supported ? 1 : 0),
  },
  result_supported: {
    defaultDirection: 'desc',
    value: (action) => resultLabel(action),
  },
  elapsed_time_ms: {
    defaultDirection: 'desc',
    value: (action) => action.runtime?.elapsed_time_ms,
  },
  observed_goal_count: {
    defaultDirection: 'desc',
    value: (action) => action.runtime?.observed_goal_count,
  },
}

export function ActionTable({
  actions,
  onSelectAction,
  selectedActionName,
}) {
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const sortedActions = useMemo(
    () => sortRows(actions, sort, ACTION_SORT_COLUMNS),
    [actions, sort],
  )
  const onSort = (key) => setSort((current) =>
    nextSortState(current, key, ACTION_SORT_COLUMNS),
  )

  if (!actions.length) {
    return <div className="empty-state">표시할 Action이 없습니다</div>
  }

  return (
    <div className="table-wrap">
      <table className="topic-table action-table">
        <thead>
          <tr>
            <SortableHeader columnKey="status" label="상태" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="name" label="이름" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="type" label="타입" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="server_count" label="서버" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="client_count" label="클라이언트" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="last_goal_status" label="마지막 Goal" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="feedback_supported" label="Feedback" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="result_supported" label="Result" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="elapsed_time_ms" label="Elapsed" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="observed_goal_count" label="관찰 Goal" onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedActions.map((action) => {
            const runtime = action.runtime ?? {}
            const selected = action.name === selectedActionName
            return (
              <tr
                className={selected ? 'selected' : ''}
                key={action.name}
                onClick={() => onSelectAction(action.name)}
              >
                <td>
                  <StatusBadge value={action.status} />
                </td>
                <td className="topic-name action-name">{action.name}</td>
                <td className="topic-type action-type">{action.type ?? '-'}</td>
                <td>{action.server_count ?? 0}</td>
                <td>{action.client_count ?? 0}</td>
                <td>
                  <StatusBadge
                    value={
                      runtime.last_goal_status === 'unknown'
                        ? 'goal_unobserved'
                        : runtime.last_goal_status ?? 'goal_unobserved'
                    }
                  />
                </td>
                <td>
                  <SupportBadge supported={action.feedback_supported} />
                </td>
                <td>
                  <ResultBadge action={action} />
                </td>
                <td>{formatMs(runtime.elapsed_time_ms)}</td>
                <td>{runtime.observed_goal_count ?? 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SupportBadge({ supported }) {
  return <StatusBadge value={supported ? 'supported' : 'unsupported'} />
}

function ResultBadge({ action }) {
  if (action.result_supported !== true) {
    return <StatusBadge value="unsupported" />
  }

  if (action.result_policy === 'observed_goal_only') {
    return <StatusBadge value="observed_goal_only" />
  }

  return <StatusBadge value="supported" />
}

function resultLabel(action) {
  if (action.result_supported !== true) {
    return 'unsupported'
  }

  return action.result_policy ?? 'supported'
}
