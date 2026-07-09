const NAV_ITEMS = [
  { id: 'overview', label: 'Total' },
  { id: 'nodes', label: 'Node', comingSoon: true },
  { id: 'topics', label: 'Topic' },
  { id: 'services', label: 'Service' },
  { id: 'actions', label: 'Action' },
  { id: 'alerts', label: 'Alert' },
]

export function Sidebar({
  activePage,
  expanded,
  onExpandedChange,
  onNavigate,
}) {
  const navigate = (page) => {
    onExpandedChange(true)
    onNavigate(page)
  }

  const navigateHome = () => {
    onExpandedChange(true)
    onNavigate('overview')
  }

  return (
    <aside
      className={expanded ? 'sidebar expanded' : 'sidebar'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onExpandedChange(false)
        }
      }}
      onFocus={() => onExpandedChange(true)}
      onMouseEnter={() => onExpandedChange(true)}
      onMouseLeave={() => onExpandedChange(false)}
      onTouchStart={() => onExpandedChange(true)}
    >
      <button
        className="brand"
        onClick={navigateHome}
        type="button"
      >
        <span className="brand-mark">R2</span>
        <span className="nav-label">통신 관제</span>
      </button>
      <nav className="nav-list" aria-label="대시보드 메뉴">
        {NAV_ITEMS.map((item) => (
          <button
            className={item.id === activePage ? 'nav-item active' : 'nav-item'}
            key={item.id}
            onClick={() => navigate(item.id)}
            title={item.label}
            type="button"
          >
            <span className="nav-icon">{item.label.slice(0, 1)}</span>
            <span className="nav-label">{item.label}</span>
            {item.comingSoon && <small>준비 중</small>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
