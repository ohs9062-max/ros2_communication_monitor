import { useMemo, useState } from 'react'
import { formatMs, formatRelativeTime } from '../utils/format.js'
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
  callable: { value: (action) => (action.callable ? 1 : 0), defaultDirection: 'desc' },
  last_goal_sent: { value: (action) => action.last_goal_summary?.last_goal_sent_at, defaultDirection: 'desc' },
  feedback_supported: {
    defaultDirection: 'desc',
    value: (action) => feedbackDisplay(action).sortValue,
  },
  result_supported: {
    defaultDirection: 'desc',
    value: (action) => resultDisplay(action).sortValue,
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
  emptyMessage = '표시할 Action이 없습니다',
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
    return <div className="empty-state">{emptyMessage}</div>
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
            <SortableHeader columnKey="callable" label="실행 가능" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="last_goal_sent" label="Goal 전송" onSort={onSort} sort={sort} />
            <th>마지막 Goal</th>
            <SortableHeader columnKey="feedback_supported" label="피드백" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="result_supported" label="결과" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="elapsed_time_ms" label="실행 시간" onSort={onSort} sort={sort} />
            <SortableHeader columnKey="observed_goal_count" label="관찰 Goal" onSort={onSort} sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sortedActions.map((action) => {
            const runtime = action.runtime ?? {}
            const summary = action.last_goal_summary
            const selected = action.name === selectedActionName
            return (
              <tr
                className={selected ? 'selected' : ''}
                data-monitor-name={action.name}
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
                      summary?.last_goal_status
                        ? summary.last_goal_status
                        : runtime.last_goal_status === 'unknown'
                        ? 'goal_unobserved'
                        : runtime.last_goal_status ?? 'goal_unobserved'
                    }
                  />
                </td>
                <td>{action.callable ? '예' : action.allowlisted ? '등록됨' : '아니오'}</td>
                <td>{formatRelativeTime(summary?.last_goal_sent_at)}</td>
                <td><PreviewText value={summary?.last_goal_preview} /></td>
                <td>
                  <FeedbackBadge action={action} />
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

function FeedbackBadge({ action }) {
  const display = feedbackDisplay(action)
  return <StatusBadge label={display.label} value={display.value} />
}

function feedbackDisplay(action) {
  const summary = action.last_goal_summary
  if (summary?.last_feedback_preview) {
    return resultState('feedback_received', '수신됨', 9)
  }
  if (summary?.error_type === 'validation_error') {
    return resultState('validation_error', '검증 실패', 1)
  }
  const runtime = action.runtime ?? {}
  const lastGoalStatus = String(runtime.last_goal_status || '').toLowerCase()

  if (runtime.feedback_error) {
    return resultState('feedback_error', '수신 오류', 1)
  }
  if (runtime.feedback_preview) {
    return resultState('feedback_received', '수신됨', 8)
  }
  if (['executing', 'accepted', 'canceling'].includes(lastGoalStatus)) {
    return resultState('feedback_waiting', '대기 중', 5)
  }
  if ((runtime.observed_goal_count ?? 0) === 0) {
    return resultState('goal_unobserved', 'Goal 미관찰', 0)
  }
  if (action.feedback_supported === false) {
    return resultState('feedback_unsupported', '미지원', 0)
  }

  return resultState('feedback_none', '수신 없음', 0)
}

function ResultBadge({ action }) {
  const display = resultDisplay(action)
  return <StatusBadge label={display.label} value={display.value} />
}

function resultDisplay(action) {
  const summary = action.last_goal_summary
  if (summary?.last_result_preview) {
    return resultState(summary.success ? 'success' : 'failed', summary.success ? '성공' : '실패', 9)
  }
  if (summary?.error_type === 'validation_error') {
    return resultState('validation_error', '검증 실패', 1)
  }
  const runtime = action.runtime ?? {}
  const resultStatus = String(runtime.result_status || '').toLowerCase()
  const lastGoalStatus = String(runtime.last_goal_status || '').toLowerCase()

  if (resultStatus) {
    if (resultStatus === 'success' || resultStatus === 'succeeded') {
      return resultState('success', '성공', 8)
    }
    if (resultStatus === 'aborted') {
      return resultState('aborted', '실패 종료', 1)
    }
    if (resultStatus === 'canceled') {
      return resultState('result_canceled', '취소됨', 4)
    }
    if (resultStatus === 'timeout') {
      return resultState('timeout', 'Timeout', 2)
    }
    if (resultStatus === 'error') {
      return resultState('result_error', '결과 조회 오류', 2)
    }
    if (resultStatus === 'unavailable') {
      return resultState('result_none', '결과 없음', 0)
    }
  }

  if (runtime.result_error) {
    return resultState('result_error', '결과 조회 오류', 2)
  }

  if (lastGoalStatus === 'executing') {
    return resultState('result_waiting', '결과 대기', 6)
  }
  if (lastGoalStatus === 'accepted') {
    return resultState('accepted', 'Goal 수락', 5)
  }
  if (lastGoalStatus === 'canceling') {
    return resultState('result_canceled', '취소 중', 4)
  }
  if ((runtime.observed_goal_count ?? 0) === 0) {
    return resultState('goal_unobserved', 'Goal 미관찰', 0)
  }

  return resultState('result_none', '결과 없음', 0)
}

function resultState(value, label, sortValue) {
  return { label, sortValue, value }
}

function PreviewText({ value }) {
  if (value === undefined || value === null || value === '') return <span className="muted">-</span>
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return <code className="table-preview-text">{text}</code>
}
