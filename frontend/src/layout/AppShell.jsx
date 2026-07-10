import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'
import { useState } from 'react'

export function AppShell({
  activePage,
  children,
  dashboard,
  onNavigate,
  websocket,
}) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className={sidebarExpanded ? 'app-shell sidebar-open' : 'app-shell'}>
      <Sidebar
        activePage={activePage}
        expanded={sidebarExpanded}
        onExpandedChange={setSidebarExpanded}
        onNavigate={onNavigate}
      />
      <div className="app-content">
        <Header
          health={dashboard.health}
          lastUpdated={dashboard.lastUpdated}
          onNavigate={onNavigate}
          websocket={websocket}
        />
        {children}
      </div>
    </div>
  )
}
