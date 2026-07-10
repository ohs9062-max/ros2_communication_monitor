import { SummaryCard } from './SummaryCard.jsx'

export function ServiceSummaryCards({
  meta = {},
  primaryServices = [],
  services = [],
  summary,
}) {
  const activeCheckIssues =
    (meta.active_check_failed_count ?? 0) +
    (meta.active_check_timeout_count ?? 0) +
    (meta.active_check_error_count ?? 0)
  const total =
    summary?.total ??
    meta.count ??
    ((meta.visible_count ?? services.length) + (meta.hidden_count ?? 0))
  const activeCheckCount =
    summary?.activeCheckCount ?? meta.active_check_supported_count ?? 0
  const issueCount = summary?.issueCount ?? activeCheckIssues
  const statusOnlyCount =
    summary?.statusOnlyCount ??
    services.filter((service) => service.active_check_supported === false).length
  const internalManagementCount =
    summary?.internalManagementCount ?? meta.hidden_count ?? 0

  return (
    <div className="summary-grid service-summary-grid">
      <SummaryCard label="전체 Service" value={total} />
      <SummaryCard label="주요 Service" value={summary?.primaryCount ?? primaryServices.length} tone="good" />
      <SummaryCard
        label="응답 측정"
        value={activeCheckCount}
      />
      <SummaryCard
        label="대기/오류"
        tone={issueCount ? 'bad' : 'default'}
        value={issueCount}
      />
      <SummaryCard label="상태만 표시" value={statusOnlyCount} />
      <SummaryCard label="내부/관리" value={internalManagementCount} />
    </div>
  )
}
