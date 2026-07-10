import { SummaryCard } from './SummaryCard.jsx'

export function ActionSummaryCards({
  actions = [],
  activeActions = [],
  meta = {},
}) {
  const warningErrorCount =
    (meta.warning_count ?? 0) + (meta.error_count ?? 0)
  const runningCount = actions.filter((action) =>
    ['accepted', 'executing', 'canceling'].includes(
      String(action.runtime?.last_goal_status ?? '').toLowerCase(),
    ),
  ).length
  const succeededCount = actions.filter((action) => {
    const runtime = action.runtime ?? {}
    return (
      runtime.last_goal_status === 'succeeded' ||
      runtime.result_status === 'succeeded' ||
      runtime.result_status === 'success'
    )
  }).length
  const failedCanceledCount = actions.filter((action) => {
    const runtime = action.runtime ?? {}
    const lastGoalStatus = String(runtime.last_goal_status ?? '').toLowerCase()
    const resultStatus = String(runtime.result_status ?? '').toLowerCase()
    return (
      ['aborted', 'canceled'].includes(lastGoalStatus) ||
      ['aborted', 'canceled', 'error', 'timeout'].includes(resultStatus) ||
      Boolean(runtime.result_error)
    )
  }).length
  const observedGoalCount =
    meta.observed_goal_count ??
    actions.reduce(
      (sum, action) =>
        sum + (action.runtime?.observed_goal_count ?? 0),
      0,
    )

  return (
    <div className="summary-grid action-summary-grid">
      <SummaryCard label="전체 Action" value={meta.count ?? 0} />
      <SummaryCard label="활동 Action" value={activeActions.length} tone="good" />
      <SummaryCard label="실행 중" value={runningCount} />
      <SummaryCard label="성공" value={succeededCount} tone="good" />
      <SummaryCard
        label="실패/취소"
        tone={failedCanceledCount ? 'bad' : 'default'}
        value={failedCanceledCount}
      />
      <SummaryCard
        label="주의/오류"
        tone={warningErrorCount ? 'warn' : 'default'}
        value={warningErrorCount}
      />
      <SummaryCard label="관찰 Goal" value={observedGoalCount} />
    </div>
  )
}
