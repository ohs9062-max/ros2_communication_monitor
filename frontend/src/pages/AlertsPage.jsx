import { AlertsList } from '../components/AlertsList.jsx'

export function AlertsPage({
  actionDashboard,
  dashboard,
  nodeDashboard,
  onNavigate,
  serviceDashboard,
}) {
  const alerts = dashboard.alerts.data?.data ?? []

  const openAlert = (alert) => {
    if (alert.source === 'topic' || alert.source === 'monitor_status') {
      dashboard.setIncludeAllTopics(true)
      dashboard.setSelectedTopicName(alert.name)
      onNavigate('topics')
      return
    }

    if (alert.source === 'service') {
      serviceDashboard.setIncludeHidden(true)
      serviceDashboard.setSelectedServiceName(alert.name)
      onNavigate('services')
      return
    }

    if (alert.source === 'action') {
      actionDashboard.setIncludeIdleActions(true)
      actionDashboard.setSelectedActionName(alert.name)
      onNavigate('actions')
      return
    }

    if (alert.source === 'node' || alert.code === 'node_stale') {
      const targetNode = nodeDashboard.nodes.find(
        (node) => node.full_name === alert.name || node.name === alert.name,
      )
      nodeDashboard.setIncludeInternalNodes(true)
      nodeDashboard.setStatusFilter('all')
      nodeDashboard.setSelectedNodeName(targetNode?.full_name ?? alert.name)
      onNavigate('nodes')
    }
  }

  return (
    <main className="single-page">
      <section className="topic-section">
        <div className="section-heading">
          <div>
            <h2>전체 Alert</h2>
            <p className="muted">/ros/alerts에서 받은 모든 Alert 목록</p>
          </div>
          {dashboard.alerts.error && (
            <span className="error-text">{dashboard.alerts.error}</span>
          )}
        </div>
        <AlertsList alerts={alerts} onAlertClick={openAlert} />
      </section>
    </main>
  )
}
