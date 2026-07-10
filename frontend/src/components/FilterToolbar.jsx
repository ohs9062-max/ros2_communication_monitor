const FILTERS = [
  { id: 'primary', label: '주요 항목' },
  { id: 'all', label: '전체' },
  { id: 'waiting', label: '대기 중' },
  { id: 'active', label: '정상' },
  { id: 'warning', label: '주의' },
  { id: 'error', label: '오류' },
  { id: 'missing', label: '미수신' },
  { id: 'no_subscriber', label: '구독자 없음' },
  { id: 'unsupported', label: '미지원' },
]

export function FilterToolbar({
  includeAllTopics = false,
  search,
  statusFilter,
  onIncludeAllTopicsChange,
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
          className={includeAllTopics ? 'filter active' : 'filter'}
          onClick={() => onIncludeAllTopicsChange?.(!includeAllTopics)}
          type="button"
        >
          숨김 포함
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
