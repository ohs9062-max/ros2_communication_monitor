import { AlertsList } from '../components/AlertsList.jsx'

export function AlertsPage({ dashboard, onNavigate }) {
  const alerts = dashboard.alerts.data?.data ?? []

  const openAlert = (alert) => {
    if (alert.source === 'topic' || alert.source === 'monitor_status') {
      dashboard.setSelectedTopicName(alert.name)
      onNavigate('topics')
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
