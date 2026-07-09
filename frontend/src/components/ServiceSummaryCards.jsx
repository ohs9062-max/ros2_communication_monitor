import { SummaryCard } from './SummaryCard.jsx'

export function ServiceSummaryCards({ meta }) {
  const activeCheckIssues =
    (meta.active_check_failed_count ?? 0) +
    (meta.active_check_timeout_count ?? 0) +
    (meta.active_check_error_count ?? 0)
  const warningErrorCount =
    (meta.warning_count ?? 0) + (meta.error_count ?? 0)

  return (
    <div className="summary-grid service-summary-grid">
      <SummaryCard label="표시 Service" value={meta.visible_count ?? meta.count ?? 0} />
      <SummaryCard label="내부 Service" value={meta.hidden_count ?? 0} />
      <SummaryCard label="정상" value={meta.active_count ?? 0} tone="good" />
      <SummaryCard
        label="주의/오류"
        tone={warningErrorCount ? 'warn' : 'default'}
        value={warningErrorCount}
      />
      <SummaryCard
        label="응답 측정 가능"
        value={meta.active_check_supported_count ?? 0}
      />
      <SummaryCard
        label="응답 측정 문제"
        tone={activeCheckIssues ? 'bad' : 'default'}
        value={activeCheckIssues}
      />
    </div>
  )
}
