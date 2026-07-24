import { SummaryCard } from './SummaryCard.jsx'

export function ServiceSummaryCards({
  meta = {},
  primaryServices = [],
  services = [],
  summary,
}) {
  const total =
    summary?.total ??
    meta.count ??
    ((meta.visible_count ?? services.length) + (meta.hidden_count ?? 0))
  const activeCount =
    summary?.activeCount ??
    services.filter((service) => service.status === 'active').length
  const waitingCount =
    summary?.waitingCount ??
    services.filter((service) => service.status === 'waiting_server').length
  const issueCount = summary?.issueCount ?? waitingCount
  const internalManagementCount =
    summary?.internalManagementCount ?? meta.hidden_count ?? 0

  return (
    <div className="summary-grid service-summary-grid">
      <SummaryCard label="전체 Service" value={total} />
      <SummaryCard label="주요 Service" value={summary?.primaryCount ?? primaryServices.length} tone="good" />
      <SummaryCard
        label="정상"
        tone="good"
        value={activeCount}
      />
      <SummaryCard
        label="대기/오류"
        tone={issueCount ? 'bad' : 'default'}
        value={issueCount}
      />
      <SummaryCard label="서버 대기" value={waitingCount} />
      <SummaryCard label="내부/관리" value={internalManagementCount} />
    </div>
  )
}
