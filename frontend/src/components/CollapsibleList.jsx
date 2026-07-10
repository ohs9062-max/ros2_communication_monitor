import { useState } from 'react'

const DEFAULT_VISIBLE_COUNT = 3

export function CollapsibleList({
  defaultCollapsed = true,
  emptyText = '없음',
  initialVisibleCount = DEFAULT_VISIBLE_COUNT,
  items = [],
  renderItem,
  title,
}) {
  const [expanded, setExpanded] = useState(!defaultCollapsed)
  const hasItems = items.length > 0
  const visibleCount = Math.max(initialVisibleCount, 1)
  const canToggle = items.length > visibleCount
  const visibleItems = expanded || !canToggle
    ? items
    : items.slice(0, visibleCount)
  const hiddenCount = Math.max(items.length - visibleItems.length, 0)

  return (
    <div className="collapsible-list">
      {title && (
        <div className="collapsible-list-heading">
          <h4>{title}</h4>
          <span>{items.length}</span>
        </div>
      )}
      {!hasItems ? (
        <p className="node-empty">{emptyText}</p>
      ) : (
        <>
          <div className="collapsible-list-items">
            {visibleItems.map((item, index) => (
              <div className="collapsible-list-item" key={itemKey(item, index)}>
                {renderItem ? renderItem(item, index) : String(item)}
              </div>
            ))}
          </div>
          {canToggle && (
            <button
              className="connection-node-toggle"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? '접기' : `더 보기 ${hiddenCount}개`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function itemKey(item, index) {
  if (typeof item === 'string') {
    return item
  }
  return item?.id ?? item?.name ?? `${item?.key ?? 'item'}:${index}`
}
