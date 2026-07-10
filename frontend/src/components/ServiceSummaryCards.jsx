import { SummaryCard } from './SummaryCard.jsx'

export function ServiceSummaryCards({
  activeServices = [],
  meta = {},
  services = [],
}) {
  const activeCheckIssues =
    (meta.active_check_failed_count ?? 0) +
    (meta.active_check_timeout_count ?? 0) +
    (meta.active_check_error_count ?? 0)
  const total =
    meta.count ??
    ((meta.visible_count ?? services.length) + (meta.hidden_count ?? 0))

  return (
    <div className="summary-grid service-summary-grid">
      <SummaryCard label="전체 Service" value={total} />
      <SummaryCard label="표시 Service" value={activeServices.length} tone="good" />
      <SummaryCard label="정상" value={meta.active_count ?? 0} tone="good" />
      <SummaryCard
        label="응답 측정 가능"
        value={meta.active_check_supported_count ?? 0}
      />
      <SummaryCard
        label="응답 측정 문제"
        tone={activeCheckIssues ? 'bad' : 'default'}
        value={activeCheckIssues}
      />
      <SummaryCard label="내부 Service" value={meta.hidden_count ?? 0} />
    </div>
  )
}
