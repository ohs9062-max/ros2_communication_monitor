import { formatRelativeTime, formatTime } from '../utils/format.js'
import { NodeStatusBadge } from './NodeTable.jsx'

export function NodeDetailPanel({ node }) {
  if (!node) {
    return (
      <aside className="detail-panel node-detail-panel">
        <div className="empty-state">
          Node를 선택하면 상세 정보가 표시됩니다.
        </div>
      </aside>
    )
  }

  return (
    <aside className="detail-panel node-detail-panel">
      <div className="panel-heading">
        <span>Node 상세</span>
        <NodeStatusBadge status={node.status} />
      </div>
      <h2>{node.full_name}</h2>
      <p className="muted">{node.namespace ?? '/'}</p>

      {node.status === 'stale' ? (
        <p className="notice-text warning">
          이 Node는 이전에 발견되었지만 현재 ROS2 Graph에서 사라진 상태입니다.
          프로세스 종료, 통신 끊김, namespace 변경 가능성을 확인하세요.
        </p>
      ) : (
        <p className="notice-text">
          현재 ROS2 Graph에서 발견된 Node입니다.
        </p>
      )}

      <section className="detail-section">
        <h3>상태 요약</h3>
        <DetailLine label="Full name" value={node.full_name ?? '-'} />
        <DetailLine label="Name" value={node.name ?? '-'} />
        <DetailLine label="Namespace" value={node.namespace ?? '-'} />
        <DetailLine
          label="상태"
          tone={statusTone(node.status)}
          value={node.status ?? '-'}
        />
        <DetailLine label="상태 이유" value={node.reason ?? '-'} />
        <DetailLine
          label="마지막 발견"
          value={formatRelativeTime(node.last_seen_at)}
        />
        <DetailLine label="마지막 갱신" value={formatTime(node.last_updated)} />
      </section>

      <section className="detail-section">
        <h3>Pub/Sub 정보</h3>
        <div className="metric-grid">
          <Metric label="Publisher" value={node.publisher_count ?? 0} />
          <Metric label="Subscriber" value={node.subscriber_count ?? 0} />
        </div>
        <EntityList
          emptyMessage="Publisher 없음"
          items={node.topic_publishers}
          title="Topic Publishers"
        />
        <EntityList
          emptyMessage="Subscriber 없음"
          items={node.topic_subscribers}
          title="Topic Subscribers"
        />
      </section>

      <section className="detail-section">
        <h3>Service 정보</h3>
        <div className="metric-grid">
          <Metric
            label="Service Server"
            value={node.service_server_count ?? 0}
          />
          <Metric
            label="Service Client"
            value={node.service_client_count ?? 0}
          />
        </div>
        <EntityList
          emptyMessage="Service Server 없음"
          items={node.service_servers}
          title="Service Servers"
        />
        <EntityList
          emptyMessage="Service Client 없음"
          items={node.service_clients}
          title="Service Clients"
        />
      </section>

      <section className="detail-section">
        <h3>Action 정보</h3>
        <div className="metric-grid">
          <Metric
            label="Action Server"
            value={node.action_server_count ?? 0}
          />
          <Metric
            label="Action Client"
            value={node.action_client_count ?? 0}
          />
        </div>
        <EntityList
          emptyMessage="Action Server 없음"
          items={node.action_servers}
          title="Action Servers"
        />
        <EntityList
          emptyMessage="Action Client 없음"
          items={node.action_clients}
          title="Action Clients"
        />
      </section>
    </aside>
  )
}

function DetailLine({ label, tone, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong className={tone ? `detail-value-${tone}` : undefined}>
        {value}
      </strong>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EntityList({ emptyMessage, items = [], title }) {
  return (
    <div className="node-entity-list">
      <h4>{title}</h4>
      {!items.length ? (
        <p className="node-empty">{emptyMessage}</p>
      ) : (
        <div className="node-entity-items">
          {items.map((item) => (
            <div className="node-entity-item" key={`${item.name}:${item.type}`}>
              <strong>{item.name}</strong>
              <span>{item.type ?? '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'active') {
    return 'good'
  }
  if (value === 'stale') {
    return 'warn'
  }
  if (value === 'error' || value === 'critical') {
    return 'bad'
  }
  return 'muted'
}
