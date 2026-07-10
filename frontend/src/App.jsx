import './App.css'
import { useState } from 'react'
import { AppShell } from './layout/AppShell.jsx'
import { useActionDashboard } from './hooks/useActionDashboard.js'
import { useMonitorWebSocket } from './hooks/useMonitorWebSocket.js'
import { useNodeDashboard } from './hooks/useNodeDashboard.js'
import { useServiceDashboard } from './hooks/useServiceDashboard.js'
import { useTopicDashboard } from './hooks/useTopicDashboard.js'
import {
  AlertsPage,
  ActionsPage,
  NodesPage,
  OverviewPage,
  ServicesPage,
  TopicsPage,
  VisualizationPage,
} from './pages/index.js'

function App() {
  const [activePage, setActivePage] = useState('overview')
  const dashboard = useTopicDashboard()
  const serviceDashboard = useServiceDashboard()
  const actionDashboard = useActionDashboard()
  const nodeDashboard = useNodeDashboard()
  const monitorWebSocket = useMonitorWebSocket()
  const navigate = (page) => setActivePage(page)

  return (
    <AppShell
      activePage={activePage}
      dashboard={dashboard}
      onNavigate={navigate}
      websocket={monitorWebSocket}
    >
      {activePage === 'overview' && (
        <OverviewPage
          actionDashboard={actionDashboard}
          dashboard={dashboard}
          nodeDashboard={nodeDashboard}
          onNavigate={navigate}
          serviceDashboard={serviceDashboard}
        />
      )}
      {activePage === 'topics' && <TopicsPage dashboard={dashboard} />}
      {activePage === 'alerts' && (
        <AlertsPage
          actionDashboard={actionDashboard}
          dashboard={dashboard}
          nodeDashboard={nodeDashboard}
          onNavigate={navigate}
          serviceDashboard={serviceDashboard}
        />
      )}
      {activePage === 'nodes' && <NodesPage dashboard={nodeDashboard} />}
      {activePage === 'services' && (
        <ServicesPage dashboard={serviceDashboard} />
      )}
      {activePage === 'actions' && (
        <ActionsPage dashboard={actionDashboard} />
      )}
      {activePage === 'visualization' && (
        <VisualizationPage websocket={monitorWebSocket} />
      )}
    </AppShell>
  )
}

export default App
