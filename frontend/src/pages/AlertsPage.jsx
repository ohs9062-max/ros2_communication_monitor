import { useState } from 'react'

import { AlertsList } from '../components/AlertsList.jsx'

export function AlertsPage({
  actionDashboard,
  dashboard,
  nodeDashboard,
  onNavigate,
  serviceDashboard,
}) {
  const [activeTab, setActiveTab] = useState('current')
  const response = dashboard.alerts.data
  const currentAlerts = (response?.data ?? []).filter(
    (alert) => alert.alert_state !== 'resolved',
  )
  const previousAlerts = response?.history ?? []
  const alerts = activeTab === 'previous' ? previousAlerts : currentAlerts

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
            <h2>Alert</h2>
            <p className="muted">
              현재 장애와 최근 해결된 Alert를 구분해 표시합니다
            </p>
          </div>
          {dashboard.alerts.error && (
            <span className="error-text">{dashboard.alerts.error}</span>
          )}
        </div>
        <div className="alert-tabs" role="tablist" aria-label="Alert 목록">
          <button
            aria-selected={activeTab === 'current'}
            className={activeTab === 'current' ? 'active' : ''}
            onClick={() => setActiveTab('current')}
            role="tab"
            type="button"
          >
            현재 Alert
            <span>{currentAlerts.length}</span>
          </button>
          <button
            aria-selected={activeTab === 'previous'}
            className={activeTab === 'previous' ? 'active' : ''}
            onClick={() => setActiveTab('previous')}
            role="tab"
            type="button"
          >
            이전 Alert
            <span>{previousAlerts.length}</span>
          </button>
        </div>
        <AlertsList
          alerts={alerts}
          emptyMessage={
            activeTab === 'previous'
              ? '해결된 이전 Alert가 없습니다'
              : '현재 active Alert가 없습니다'
          }
          onAlertClick={openAlert}
          timeLabel={activeTab === 'previous' ? '해결 시각' : '감지 시각'}
        />
      </section>
    </main>
  )
}
