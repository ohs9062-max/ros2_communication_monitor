import { formatRelativeTime, formatTime } from '../utils/format.js'
import { CollapsibleList } from './CollapsibleList.jsx'
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
        <DetailLine label="전체 이름" value={node.full_name ?? '-'} />
        <DetailLine label="이름" value={node.name ?? '-'} />
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
          <Metric label="발행자 수" value={node.publisher_count ?? 0} />
          <Metric label="구독자 수" value={node.subscriber_count ?? 0} />
        </div>
        <EntityList
          emptyMessage="발행 Topic 없음"
          items={node.topic_publishers}
          title="발행 Topic"
        />
        <EntityList
          emptyMessage="구독 Topic 없음"
          items={node.topic_subscribers}
          title="구독 Topic"
        />
      </section>

      <section className="detail-section">
        <h3>Service 정보</h3>
        <div className="metric-grid">
          <Metric
            label="응답 Service"
            value={node.service_server_count ?? 0}
          />
          <Metric
            label="요청 Service"
            value={node.service_client_count ?? 0}
          />
        </div>
        <EntityList
          emptyMessage="응답 Service 없음"
          items={node.service_servers}
          title="응답 Service"
        />
        <EntityList
          emptyMessage="요청 Service 없음"
          items={node.service_clients}
          title="요청 Service"
        />
      </section>

      <section className="detail-section">
        <h3>Action 정보</h3>
        <div className="metric-grid">
          <Metric
            label="Goal 실행 Action"
            value={node.action_server_count ?? 0}
          />
          <Metric
            label="Goal 요청 Action"
            value={node.action_client_count ?? 0}
          />
        </div>
        <EntityList
          emptyMessage="Goal 실행 Action 없음"
          items={node.action_servers}
          title="Goal 실행 Action"
        />
        <EntityList
          emptyMessage="Goal 요청 Action 없음"
          items={node.action_clients}
          title="Goal 요청 Action"
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
    <CollapsibleList
      emptyText={emptyMessage}
      items={items}
      renderItem={(item) => (
        <>
          <strong>{item.name}</strong>
          <span>{item.type ?? item.types?.[0] ?? '-'}</span>
        </>
      )}
      title={title}
    />
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
