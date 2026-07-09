import { StatusBadge } from './StatusBadge.jsx'

export function AlertsPreview({
  alerts,
  emptyMessage = '현재 Alert가 없습니다',
  error,
  onAlertClick,
  title = '최근 Alert',
}) {
  const items = (alerts ?? []).slice(0, 5)
  const tone = alertTone(items)

  return (
    <section className={`alerts-preview ${tone}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        {error && <span className="error-text">{error}</span>}
      </div>
      {!items.length ? (
        <div className="empty-state compact">{emptyMessage}</div>
      ) : (
        <div className="alert-list">
          {items.map((alert) => (
            <button
              className="alert-item"
              key={alert.id}
              onClick={() => onAlertClick?.(alert)}
              type="button"
            >
              <StatusBadge value={alert.level} />
              <div>
                <strong>{alert.name}</strong>
                <p>{alert.message}</p>
                <span className="muted">{alert.source}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function alertTone(alerts) {
  if (!alerts.length) {
    return 'empty'
  }

  if (
    alerts.some((alert) =>
      ['error', 'critical'].includes(String(alert.level || '').toLowerCase()),
    )
  ) {
    return 'has-error'
  }

  return 'has-warning'
}
