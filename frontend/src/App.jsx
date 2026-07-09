import './App.css'
import { useState } from 'react'
import { AppShell } from './layout/AppShell.jsx'
import { useActionDashboard } from './hooks/useActionDashboard.js'
import { useServiceDashboard } from './hooks/useServiceDashboard.js'
import { useTopicDashboard } from './hooks/useTopicDashboard.js'
import {
  AlertsPage,
  ActionsPage,
  OverviewPage,
  PlaceholderPage,
  ServicesPage,
  TopicsPage,
} from './pages/index.js'

function App() {
  const [activePage, setActivePage] = useState('overview')
  const dashboard = useTopicDashboard()
  const serviceDashboard = useServiceDashboard()
  const actionDashboard = useActionDashboard()
  const navigate = (page) => setActivePage(page)

  return (
    <AppShell
      activePage={activePage}
      dashboard={dashboard}
      onNavigate={navigate}
    >
      {activePage === 'overview' && (
        <OverviewPage
          actionDashboard={actionDashboard}
          dashboard={dashboard}
          onNavigate={navigate}
          serviceDashboard={serviceDashboard}
        />
      )}
      {activePage === 'topics' && <TopicsPage dashboard={dashboard} />}
      {activePage === 'alerts' && (
        <AlertsPage dashboard={dashboard} onNavigate={navigate} />
      )}
      {activePage === 'nodes' && (
        <PlaceholderPage
          title="Node"
          message="Node 모니터링 백엔드는 아직 구현되지 않았습니다."
        />
      )}
      {activePage === 'services' && (
        <ServicesPage dashboard={serviceDashboard} />
      )}
      {activePage === 'actions' && (
        <ActionsPage dashboard={actionDashboard} />
      )}
    </AppShell>
  )
}

export default App
