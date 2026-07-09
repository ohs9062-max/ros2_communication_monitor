export function SortableHeader({ columnKey, label, onSort, sort }) {
  const active = sort.key === columnKey
  const indicator = active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'

  return (
    <th>
      <button
        className={active ? 'sort-header active' : 'sort-header'}
        onClick={() => onSort(columnKey)}
        type="button"
      >
        <span>{label}</span>
        <span className="sort-indicator" aria-hidden="true">
          {indicator}
        </span>
      </button>
    </th>
  )
}
