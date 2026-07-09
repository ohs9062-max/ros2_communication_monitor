import { SummaryCard } from './SummaryCard.jsx'

export function ActionSummaryCards({ meta }) {
  const warningErrorCount =
    (meta.warning_count ?? 0) + (meta.error_count ?? 0)

  return (
    <div className="summary-grid action-summary-grid">
      <SummaryCard label="전체 Action" value={meta.count ?? 0} />
      <SummaryCard label="정상" value={meta.active_count ?? 0} tone="good" />
      <SummaryCard
        label="주의/오류"
        tone={warningErrorCount ? 'warn' : 'default'}
        value={warningErrorCount}
      />
      <SummaryCard label="서버" value={meta.server_count ?? 0} />
      <SummaryCard label="클라이언트" value={meta.client_count ?? 0} />
      <SummaryCard label="관찰 Goal" value={meta.observed_goal_count ?? 0} />
      <SummaryCard
        label="Feedback 지원"
        value={meta.feedback_supported_count ?? 0}
      />
      <SummaryCard
        label="Result 지원"
        value={meta.result_supported_count ?? 0}
      />
    </div>
  )
}
