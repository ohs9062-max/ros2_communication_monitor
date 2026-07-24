import { useState } from 'react'

import { StatusBadge } from './StatusBadge.jsx'

export function AlertsPreview({
  alerts,
  collapsedItems = 3,
  collapsible = false,
  emptyMessage = '현재 Alert가 없습니다',
  error,
  maxItems = 5,
  onAlertClick,
  title = '최근 Alert',
}) {
  const [expanded, setExpanded] = useState(false)
  const recentItems = (alerts ?? []).slice(0, maxItems)
  const items =
    collapsible && !expanded
      ? recentItems.slice(0, collapsedItems)
      : recentItems
  const tone = alertTone(recentItems)

  return (
    <section
      className={[
        'alerts-preview',
        tone,
        collapsible ? 'collapsible' : '',
        expanded ? 'expanded' : 'collapsed',
      ].filter(Boolean).join(' ')}
    >
      <div className="section-heading">
        <h2>{title}</h2>
        <div className="alerts-preview-heading-actions">
          {error && <span className="error-text">{error}</span>}
          {collapsible && recentItems.length > collapsedItems && (
            <button
              aria-expanded={expanded}
              className="alerts-preview-toggle"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? '접기' : `펼치기 (${recentItems.length})`}
            </button>
          )}
        </div>
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
              <StatusBadge
                value={
                  alert.alert_state === 'resolved'
                    ? 'resolved'
                    : alert.level
                }
              />
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
  const activeAlerts = alerts.filter(
    (alert) => alert.alert_state !== 'resolved',
  )
  if (!activeAlerts.length) {
    return 'empty'
  }

  if (
    activeAlerts.some((alert) =>
      ['error', 'critical'].includes(String(alert.level || '').toLowerCase()),
    )
  ) {
    return 'has-error'
  }

  return 'has-warning'
}
