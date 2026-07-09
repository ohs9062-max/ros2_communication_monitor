const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '정상' },
  { id: 'warning', label: '주의' },
  { id: 'error', label: '오류' },
  { id: 'missing', label: '미수신' },
  { id: 'no_subscriber', label: '구독자 없음' },
  { id: 'unsupported', label: '미지원' },
]

export function FilterToolbar({
  includeInternalTopics = false,
  search,
  statusFilter,
  onIncludeInternalTopicsChange,
  onSearchChange,
  onStatusFilterChange,
}) {
  return (
    <div className="filter-toolbar topic-toolbar">
      <input
        aria-label="Topic 검색"
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Topic 이름 또는 타입 검색"
        type="search"
        value={search}
      />
      <div className="service-filter-actions">
        <button
          className={includeInternalTopics ? 'filter active' : 'filter'}
          onClick={() => onIncludeInternalTopicsChange?.(!includeInternalTopics)}
          type="button"
        >
          내부 Topic 포함
        </button>
        <div className="filter-buttons" role="group" aria-label="상태 필터">
          {FILTERS.map((filter) => (
            <button
              className={
                statusFilter === filter.id ? 'filter active' : 'filter'
              }
              key={filter.id}
              onClick={() => onStatusFilterChange(filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
