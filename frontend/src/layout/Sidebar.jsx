const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'topics', label: 'Topics' },
  { id: 'services', label: 'Services' },
  { id: 'actions', label: 'Actions' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'visualization', label: 'Visualization' },
  { id: 'alerts', label: 'Alerts' },
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
        <span className="nav-label">ROS2 Monitor</span>
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
            {item.comingSoon && <small>Soon</small>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
