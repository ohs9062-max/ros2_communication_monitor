import { CollapsibleList } from '../CollapsibleList.jsx'
import { ConnectionNodeList } from '../ConnectionNodeList.jsx'
import { StatusBadge } from '../StatusBadge.jsx'

export function VisualizationDetailPanel({ graphNode, missingNodeId }) {
  if (missingNodeId) {
    return (
      <aside className="detail-panel visualization-detail-panel">
        <div className="panel-heading">
          <span>통신 상세</span>
          <StatusBadge value="unknown" />
        </div>
        <h2>{missingNodeId.replace(/^[^:]+:/, '')}</h2>
        <p className="notice-text warning">
          선택 항목이 현재 graph에서 사라졌습니다. 필터를 조정하거나 전체
          보기를 누르면 다시 표시될 수 있습니다.
        </p>
      </aside>
    )
  }

  if (!graphNode) {
    return (
      <aside className="detail-panel visualization-detail-panel">
        <div className="empty-state">
          그래프 항목을 선택하면 연결 상세가 표시됩니다.
        </div>
      </aside>
    )
  }

  const data = graphNode.data

  return (
    <aside className="detail-panel visualization-detail-panel">
      <div className="panel-heading">
        <span>통신 상세</span>
        <StatusBadge value={data.status ?? 'unknown'} />
      </div>
      <h2>{data.label}</h2>
      <p className="muted">{kindLabel(data.kind)}</p>

      <section className="detail-section">
        <h3>상태 요약</h3>
        <DetailLine label="종류" value={kindLabel(data.kind)} />
        <DetailLine label="이름" value={data.label} />
        <DetailLine label="타입" value={data.type ?? '-'} />
        <DetailLine
          label="상태"
          tone={statusTone(data.status)}
          value={data.status ?? '-'}
        />
      </section>

      <section className="detail-section">
        <h3>연결 정보</h3>
        <div className="metric-grid">
          <Metric
            label="들어오는 연결"
            value={data.connections?.incoming.length ?? 0}
          />
          <Metric
            label="나가는 연결"
            value={data.connections?.outgoing.length ?? 0}
          />
        </div>
        <ConnectionList
          emptyMessage="들어오는 연결 없음"
          items={data.connections?.incoming}
          title="들어오는 연결"
        />
        <ConnectionList
          emptyMessage="나가는 연결 없음"
          items={data.connections?.outgoing}
          title="나가는 연결"
        />
      </section>

      <section className="detail-section">
        <h3>상세 정보</h3>
        <KindSpecificDetails data={data} />
      </section>
    </aside>
  )
}

function KindSpecificDetails({ data }) {
  const entity = data.entity ?? {}
  if (data.kind === 'node') {
    return (
      <>
        <DetailLine label="발행 수" value={entity.publisher_count} />
        <DetailLine label="구독 수" value={entity.subscriber_count} />
        <DetailLine label="응답 Service 수" value={entity.service_server_count} />
        <DetailLine label="요청 Service 수" value={entity.service_client_count} />
        <DetailLine label="Goal 실행 Action 수" value={entity.action_server_count} />
        <DetailLine label="Goal 요청 Action 수" value={entity.action_client_count} />
        <EntityList
          emptyMessage="관련 Topic 없음"
          items={[
            ...(entity.topic_publishers ?? []),
            ...(entity.topic_subscribers ?? []),
          ]}
          title="관련 Topic"
        />
        <EntityList
          emptyMessage="관련 Service 없음"
          items={[
            ...(entity.service_servers ?? []),
            ...(entity.service_clients ?? []),
          ]}
          title="관련 Service"
        />
        <EntityList
          emptyMessage="관련 Action 없음"
          items={[
            ...(entity.action_servers ?? []),
            ...(entity.action_clients ?? []),
          ]}
          title="관련 Action"
        />
      </>
    )
  }
  if (data.kind === 'topic') {
    return (
      <>
        <DetailLine label="발행자" value={entity.publisher_count} />
        <DetailLine label="구독자" value={entity.subscriber_count} />
        <DetailLine label="Hz" value={entity.hz ?? entity.frequency_hz} />
        <ParticipantHint />
        <ConnectionNodeList
          emptyText="발행자 Node 없음"
          items={data.participants?.publishers ?? []}
          title="발행자 Node"
        />
        <ConnectionNodeList
          emptyText="구독자 Node 없음"
          items={data.participants?.subscribers ?? []}
          title="구독자 Node"
        />
      </>
    )
  }
  if (data.kind === 'service') {
    return (
      <>
        <DetailLine label="서버 수" value={entity.server_count} />
        <DetailLine label="클라이언트 수" value={entity.client_count} />
        <DetailLine
          label="응답 측정"
          value={entity.active_check?.last_status}
        />
        <p className="detail-help-text">
          Client는 요청을 보내는 Node이고, Server는 요청을 받아 응답하는
          Node입니다.
        </p>
        <ConnectionNodeList
          emptyText="응답자 Node 없음"
          items={data.participants?.servers ?? []}
          title="응답자 Node"
        />
        <ConnectionNodeList
          emptyText="요청자 Node 없음"
          items={data.participants?.clients ?? []}
          title="요청자 Node"
        />
      </>
    )
  }

  return (
    <>
      <DetailLine label="서버 수" value={entity.server_count} />
      <DetailLine label="클라이언트 수" value={entity.client_count} />
      <DetailLine
        label="마지막 Goal"
        value={entity.runtime?.last_goal_status}
      />
      <DetailLine
        label="결과 상태"
        value={entity.runtime?.result_status}
      />
      <DetailLine
        label="관찰 Goal 수"
        value={entity.runtime?.observed_goal_count}
      />
      <p className="detail-help-text">
      Goal 요청자 Node는 Goal을 보내고, Goal 실행자 Node는 Goal을 받아 실행합니다.
      </p>
      <ConnectionNodeList
      emptyText="Goal 실행자 Node 없음"
        items={data.participants?.servers ?? []}
        title="Goal 실행자 Node"
      />
      <ConnectionNodeList
      emptyText="Goal 요청자 Node 없음"
        items={data.participants?.clients ?? []}
        title="Goal 요청자 Node"
      />
    </>
  )
}

function ParticipantHint() {
  return (
    <p className="detail-help-text">
      표시된 Node 목록은 ROS2 Graph에서 확인된 Node 기준입니다.
    </p>
  )
}

function DetailLine({ label, tone, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong className={tone ? `detail-value-${tone}` : undefined}>
        {value ?? '-'}
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

function ConnectionList({ emptyMessage, items = [], title }) {
  return (
    <CollapsibleList
      emptyText={emptyMessage}
      items={items}
      renderItem={(item) => (
        <>
          <strong>{item.id.replace(/^[^:]+:/, '')}</strong>
          <span>{item.label}</span>
        </>
      )}
      title={title}
    />
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

function kindLabel(kind) {
  if (kind === 'node') {
    return 'Node'
  }
  if (kind === 'topic') {
    return 'Topic'
  }
  if (kind === 'service') {
    return 'Service'
  }
  return 'Action'
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['active', 'success', 'succeeded', 'normal_hz'].includes(value)) {
    return 'good'
  }
  if (
    [
      'warning',
      'stale',
      'waiting_publisher',
      'waiting_server',
      'pending',
      'canceling',
      'canceled',
      'low_hz',
    ].includes(value)
  ) {
    return 'warn'
  }
  if (
    [
      'error',
      'critical',
      'failed',
      'aborted',
      'timeout',
      'never_received',
      'zero_hz',
    ].includes(value)
  ) {
    return 'bad'
  }
  if (['accepted', 'executing', 'result_waiting'].includes(value)) {
    return 'info'
  }
  return 'muted'
}
