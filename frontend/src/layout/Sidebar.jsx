import { pagePath } from '../hooks/useBrowserRoute.js'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'topics', label: 'Topics' },
  { id: 'services', label: 'Services' },
  { id: 'actions', label: 'Actions' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'visualization', label: 'Visualization' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'interfaceLab', label: 'Interface Lab' },
]

export function Sidebar({
  activePage,
  expanded,
  onExpandedChange,
  onNavigate,
}) {
  const navigate = (event, page) => {
    onExpandedChange(true)
    if (isModifiedClick(event)) {
      return
    }

    event.preventDefault()
    onNavigate(page)
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
      <a
        className="brand"
        href={pagePath('overview')}
        onClick={(event) => navigate(event, 'overview')}
      >
        <span className="brand-mark">R2</span>
        <span className="nav-label">ROS2 Monitor</span>
      </a>
      <nav className="nav-list" aria-label="대시보드 메뉴">
        {NAV_ITEMS.map((item) => (
          <a
            className={item.id === activePage ? 'nav-item active' : 'nav-item'}
            href={pagePath(item.id)}
            key={item.id}
            onClick={(event) => navigate(event, item.id)}
            title={item.label}
          >
            <span className="nav-icon">{item.label.slice(0, 1)}</span>
            <span className="nav-label">{item.label}</span>
            {item.comingSoon && <small>Soon</small>}
          </a>
        ))}
      </nav>
    </aside>
  )
}

function isModifiedClick(event) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}
