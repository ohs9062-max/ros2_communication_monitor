import { StatusBadge } from './StatusBadge.jsx'

export function OverviewStatusCard({ status, alertMeta }) {
  const warningCount = alertMeta?.warning_count ?? 0
  const errorCount = alertMeta?.error_count ?? 0
  const criticalCount = alertMeta?.critical_count ?? 0
  const total = alertMeta?.count ?? 0

  return (
    <section className="overview-status-card">
      <div>
        <p className="eyebrow">전체 상태</p>
        <h2>ROS2 통신 상태</h2>
      </div>
      <div className="overall-status">
        <StatusBadge value={status} />
        <strong>{total}</strong>
        <span className="muted">활성 Alert</span>
      </div>
      <div className="overall-counts">
        <span>주의 {warningCount}</span>
        <span>오류 {errorCount}</span>
        <span>심각 {criticalCount}</span>
      </div>
    </section>
  )
}
