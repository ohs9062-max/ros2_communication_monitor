import { useState } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { OverviewStatusCard } from '../components/OverviewStatusCard.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import {
  getActionSummary,
  getServiceSummary,
  getTopicSummary,
  overallStatus,
} from '../utils/status.js'

export function OverviewPage({
  actionDashboard,
  dashboard,
  nodeDashboard,
  onNavigate,
  serviceDashboard,
}) {
  const [chartValueMode, setChartValueMode] = useState('percent')
  const { alerts, setSelectedTopicName, topicItems } = dashboard
  const summary = getTopicSummary(topicItems)
  const serviceSummary = getServiceSummary(
    serviceDashboard.services,
    serviceDashboard.meta,
  )
  const actionSummary = getActionSummary(
    actionDashboard.actions,
    actionDashboard.meta,
  )
  const nodeSummary = getNodeSummary(
    nodeDashboard.nodes,
    nodeDashboard.meta,
  )
  const alertMeta = alerts.data?.meta ?? {}
  const alertItems = alerts.data?.data ?? []
  const alertSummary = getAlertSummary(alertMeta, alertItems)
  const status = overallStatus(alertMeta)
  const chartItems = [
    {
      id: 'nodes',
      label: 'Node',
      total: nodeSummary.total,
      summary: {
        green: nodeSummary.active,
        yellow: nodeSummary.warning,
        red: nodeSummary.error + nodeSummary.inactive,
      },
    },
    {
      id: 'topics',
      label: 'Topic',
      total: summary.total,
      summary: {
        green: summary.active,
        yellow: summary.warning,
        red: summary.error + summary.inactive,
      },
    },
    {
      id: 'services',
      label: 'Service',
      total: serviceSummary.total,
      summary: {
        green: serviceSummary.active,
        yellow: serviceSummary.warning,
        red: serviceSummary.error + serviceSummary.inactive,
      },
    },
    {
      id: 'actions',
      label: 'Action',
      total: actionSummary.total,
      summary: {
        green: actionSummary.active,
        yellow: actionSummary.warning,
        red: actionSummary.error + actionSummary.inactive,
      },
    },
    {
      id: 'alerts',
      label: 'Alert',
      total: alertSummary.total,
      summary: {
        green: alertSummary.total ? 0 : 1,
        yellow: alertSummary.warning,
        red: alertSummary.error + alertSummary.critical,
      },
    },
  ]

  const openAlert = (alert) => {
    if (alert.source === 'topic') {
      setSelectedTopicName(alert.name)
      onNavigate('topics')
      return
    }

    if (alert.source === 'service') {
      onNavigate('services')
      return
    }

    onNavigate('alerts')
  }

  return (
    <main className="overview-page">
      <OverviewStatusCard alertMeta={alertMeta} status={status} />

      <section className="overview-preview-grid">
        <AlertsPreview
          alerts={alertItems}
          error={alerts.error}
          onAlertClick={openAlert}
        />
        <PreviewCard
          metrics={[
            { label: '실행 중', value: nodeSummary.active },
            { label: '주의/오류', value: nodeSummary.warning + nodeSummary.error },
            { label: 'Pub/Sub', value: nodeSummary.pubSub },
          ]}
          onClick={() => onNavigate('nodes')}
          status={resourceStatus(nodeSummary)}
          title="Node 미리보기"
          total={nodeSummary.total}
        />
        <PreviewCard
          metrics={[
            { label: '정상', value: summary.active },
            { label: '구독자 없음', value: summary.noSubscriber },
            { label: '주의', value: summary.warning },
          ]}
          onClick={() => onNavigate('topics')}
          status={resourceStatus(summary)}
          title="Topic 미리보기"
          total={summary.total}
        />
        <PreviewCard
          metrics={[
            { label: '정상', value: serviceSummary.active },
            { label: '서버 대기', value: serviceSummary.warning },
            { label: '오류', value: serviceSummary.error },
          ]}
          onClick={() => onNavigate('services')}
          status={resourceStatus(serviceSummary)}
          title="Service 미리보기"
          total={serviceSummary.total}
        />
        <PreviewCard
          metrics={[
            { label: '정상', value: actionSummary.active },
            {
              label: '주의/오류',
              value: actionSummary.warning + actionSummary.error,
            },
            { label: '관찰 Goal', value: actionSummary.observedGoals },
          ]}
          onClick={() => onNavigate('actions')}
          status={resourceStatus(actionSummary)}
          title="Action 미리보기"
          total={actionSummary.total}
        />
      </section>

      <OverviewColumnChart
        items={chartItems}
        onNavigate={onNavigate}
        onValueModeChange={setChartValueMode}
        valueMode={chartValueMode}
      />
    </main>
  )
}

function PreviewCard({ title, total, status, metrics, onClick }) {
  return (
    <button className="overview-preview-card" onClick={onClick} type="button">
      <div className="overview-preview-head">
        <span>{title}</span>
        <StatusBadge value={status} />
      </div>
      <strong>{total}</strong>
      <div className="overview-preview-metrics">
        {metrics.map((metric) => (
          <span className="overview-preview-metric" key={metric.label}>
            {metric.label}: <b>{metric.value}</b>
          </span>
        ))}
      </div>
    </button>
  )
}

function OverviewColumnChart({
  items,
  onNavigate,
  onValueModeChange,
  valueMode,
}) {
  return (
    <section className="overview-column-chart">
      <div className="overview-chart-area">
        <div className="overview-chart-title">
          <h2>상태 분포</h2>
          <span className="muted">Node / Topic / Service / Action / Alert</span>
        </div>
        <div className="chart-plot">
          <span className="chart-axis-label y-axis">비율</span>
          <div className="chart-grid-lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="chart-columns">
            {items.map((item) => (
              <button
                className="chart-column-button"
                key={item.id}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <StackedColumn summary={item.summary} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <span className="chart-axis-label x-axis">리소스</span>
        </div>
      </div>
      <div className="overview-chart-side">
        <div className="chart-value-toggle" role="group" aria-label="상태분포 표시 방식">
          <button
            className={valueMode === 'percent' ? 'active' : ''}
            onClick={() => onValueModeChange('percent')}
            type="button"
          >
            백분율
          </button>
          <button
            className={valueMode === 'count' ? 'active' : ''}
            onClick={() => onValueModeChange('count')}
            type="button"
          >
            개수
          </button>
        </div>
        <div className="chart-legend">
          <span><i className="green" />정상</span>
          <span><i className="yellow" />주의</span>
          <span><i className="red" />오류/비활성</span>
        </div>
        <p className="overview-inactive-note">
          비활성은 현재 실행 중이 아니거나 관찰되지 않은 상태이며, 항상 장애를
          의미하지는 않습니다.
        </p>
        <table className="chart-summary-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>정상</th>
              <th>주의</th>
              <th>오류</th>
              <th>합계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th>{item.label}</th>
                <td>
                  {formatChartValue(
                    item.summary.green,
                    item.summary,
                    valueMode,
                  )}
                </td>
                <td>
                  {formatChartValue(
                    item.summary.yellow,
                    item.summary,
                    valueMode,
                  )}
                </td>
                <td>
                  {formatChartValue(
                    item.summary.red,
                    item.summary,
                    valueMode,
                  )}
                </td>
                <td>{resourceTotal(item.summary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StackedColumn({ summary }) {
  const total = resourceTotal(summary)

  if (total === 0) {
    return <span className="chart-column empty" />
  }

  return (
    <span className="chart-column">
      <span
        className="chart-column-segment green"
        style={{ height: `${(summary.green / total) * 100}%` }}
      />
      <span
        className="chart-column-segment yellow"
        style={{ height: `${(summary.yellow / total) * 100}%` }}
      />
      <span
        className="chart-column-segment red"
        style={{ height: `${(summary.red / total) * 100}%` }}
      />
    </span>
  )
}

function resourceTotal(summary) {
  return summary.green + summary.yellow + summary.red
}

function formatPercent(value, summary) {
  const total = resourceTotal(summary)
  if (!total) {
    return '0%'
  }
  return `${Math.round((value / total) * 100)}%`
}

function formatChartValue(value, summary, valueMode) {
  if (valueMode === 'count') {
    return value
  }

  return formatPercent(value, summary)
}

function resourceStatus(summary) {
  if (summary.error) {
    return 'error'
  }
  if (summary.warning) {
    return 'warning'
  }
  return 'active'
}

function getAlertSummary(meta, alerts) {
  const warning = meta.warning_count ?? countAlertsByLevel(alerts, 'warning')
  const error = meta.error_count ?? countAlertsByLevel(alerts, 'error')
  const critical = meta.critical_count ?? countAlertsByLevel(alerts, 'critical')
  const total = meta.count ?? alerts.length

  return {
    total,
    warning,
    error,
    critical,
  }
}

function getNodeSummary(nodes, meta = {}) {
  const total = meta.count ?? nodes.length
  const active = meta.active_count ?? countNodesByStatus(nodes, 'active')
  const warning = meta.warning_count ?? countNodesByStatus(nodes, 'stale')
  const error = meta.error_count ?? countNodesByStatus(nodes, 'unknown')
  const inactive = Math.max(total - active - warning - error, 0)
  const pubSub =
    (meta.publisher_count ?? sumNodeCount(nodes, 'publisher_count')) +
    (meta.subscriber_count ?? sumNodeCount(nodes, 'subscriber_count'))

  return {
    total,
    active,
    warning,
    error,
    inactive,
    pubSub,
  }
}

function countNodesByStatus(nodes, expectedStatus) {
  return nodes.filter((node) => node.status === expectedStatus).length
}

function sumNodeCount(nodes, key) {
  return nodes.reduce((sum, node) => sum + (node[key] ?? 0), 0)
}

function countAlertsByLevel(alerts, expectedLevel) {
  return alerts.filter(
    (alert) => String(alert.level || '').toLowerCase() === expectedLevel,
  ).length
}
