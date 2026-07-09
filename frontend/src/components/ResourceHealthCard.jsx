import { HealthBar } from './HealthBar.jsx'
import { StatusBadge } from './StatusBadge.jsx'

export function ResourceHealthCard({
  title,
  status,
  total,
  metrics,
  segments,
  onClick,
  placeholder,
}) {
  return (
    <button className="resource-card" onClick={onClick} type="button">
      <div className="resource-card-head">
        <span>{title}</span>
        <StatusBadge value={status} />
      </div>
      <strong className="resource-total">{total}</strong>
      {placeholder ? (
        <p className="muted">{placeholder}</p>
      ) : (
        <>
          <HealthBar segments={segments} />
          <div className="resource-metrics">
            {metrics.map((metric) => (
              <span key={metric.label}>
                {metric.label}: <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}
