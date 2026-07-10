import { CollapsibleList } from './CollapsibleList.jsx'

const DEFAULT_LIMIT = 5

export function ConnectionNodeList({
  emptyText,
  helpText,
  initialLimit = DEFAULT_LIMIT,
  items = [],
  title,
}) {
  return (
    <div className="connection-node-list">
      {helpText && <p className="connection-node-help">{helpText}</p>}
      <CollapsibleList
        emptyText={emptyText}
        initialVisibleCount={initialLimit}
        items={items}
        renderItem={(item) => item}
        title={title}
      />
    </div>
  )
}
