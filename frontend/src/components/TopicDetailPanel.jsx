import { formatAge, formatNumber, formatTime } from '../utils/format.js'
import { ConnectionNodeList } from './ConnectionNodeList.jsx'
import { DetailSection } from './DetailSection.jsx'
import { KeyValueTable } from './KeyValueTable.jsx'
import { StatusBadge } from './StatusBadge.jsx'

export function TopicDetailPanel({ topic, latest, hz, participants }) {
  if (!topic) {
    return (
      <aside className="detail-panel">
        <div className="empty-state">
          발견된 Topic이 있으면 상세 정보가 자동으로 표시됩니다
        </div>
      </aside>
    )
  }

  const latestData = latest.data?.data
  const hzData = hz.data?.data
  const preview = latestData?.message_preview ?? topic.last_message_preview
  const values = preview?.values
  const neverReceived =
    hzData?.status === 'never_received' || latestData?.received === false

  return (
    <aside className="detail-panel">
      <div className="panel-heading">
        <span>Topic 상세</span>
        <StatusBadge value={topic.status} />
      </div>
      <h2>{topic.name}</h2>
      <p className="muted">{topic.types?.[0] ?? '-'}</p>

      {latest.error && <p className="error-text">{latest.error}</p>}
      {hz.error && <p className="error-text">{hz.error}</p>}
      {neverReceived && (
        <p className="notice-text warning">
          이 Topic은 아직 메시지를 수신하지 않았습니다. 발행자가 메시지를
          발행 중인지 확인하세요.
        </p>
      )}

      <DetailSection title="상태 요약">
        <DetailLine label="이름" value={topic.name} />
        <DetailLine label="타입" value={topic.types?.[0] ?? '-'} />
        <DetailLine label="상태" tone={statusTone(topic.status)} value={topic.status ?? '-'} />
        <DetailLine label="상태 이유" value={topic.reason ?? '-'} />
        <DetailLine label="마지막 갱신" value={formatTime(topic.last_updated)} />
      </DetailSection>

      <DetailSection collapsible title="연결 정보">
        <div className="detail-line">
          <span>발행자</span>
          <strong>{topic.publisher_count ?? 0}</strong>
        </div>
        <div className="detail-line">
          <span>전체 구독자</span>
          <strong>{topic.subscriber_count ?? 0}</strong>
        </div>
        <div className="detail-line">
          <span>외부 구독자</span>
          <strong>
            {topic.external_subscriber_count ?? topic.subscriber_count ?? 0}
          </strong>
        </div>
        <div className="detail-line">
          <span>상세 감시</span>
          <strong className={topic.deep_monitoring ? 'detail-value-good' : 'detail-value-muted'}>
            {topic.deep_monitoring ? '예' : '아니오'}
          </strong>
        </div>
      </DetailSection>

      <DetailSection collapsible title="연결 Node">
        <p className="detail-help-text">
          표시된 Node 목록은 ROS2 Graph에서 확인된 Node 기준입니다.
        </p>
        <ConnectionNodeList
          emptyText="발행자 Node 없음"
          items={participants?.publishers ?? []}
          title="발행자 Node"
        />
        <ConnectionNodeList
          emptyText="구독자 Node 없음"
          items={participants?.subscribers ?? []}
          title="구독자 Node"
        />
      </DetailSection>

      <DetailSection collapsible title="실행/측정 정보">
        <div className="metric-grid">
          <Metric label="Hz" value={formatNumber(hzData?.hz)} />
          <Metric
            label="수신 여부"
            tone={hzData?.received ? 'good' : 'muted'}
            value={hzData?.received ? '예' : '아니오'}
          />
          <Metric label="메시지 수" value={hzData?.message_count ?? '-'} />
          <Metric label="경과 시간" value={formatAge(hzData?.age_sec)} />
          <Metric
            label="오래됨"
            tone={hzData?.is_stale ? 'warn' : 'good'}
            value={hzData?.is_stale ? '예' : '아니오'}
          />
          <Metric
            label="상태"
            tone={statusTone(hzData?.status)}
            value={hzData?.status ?? '-'}
          />
        </div>
      </DetailSection>

      <DetailSection collapsible title="상세 데이터">
        <div className="detail-line">
          <span>수신 여부</span>
          <strong className={latestData?.received ? 'detail-value-good' : 'detail-value-muted'}>
            {latestData?.received ? '예' : '아니오'}
          </strong>
        </div>
        <div className="detail-line">
          <span>마지막 수신</span>
          <strong>{formatTime(latestData?.last_received_at ?? topic.last_received_at)}</strong>
        </div>
        <div className="detail-line">
          <span>상세 감시</span>
          <strong className={topic.detailed_monitoring_enabled ? 'detail-value-good' : 'detail-value-muted'}>
            {topic.detailed_monitoring_enabled ? '예' : '아니오'}
          </strong>
        </div>
        <div className="detail-line">
          <span>관찰됨</span>
          <strong className={topic.observed ? 'detail-value-good' : 'detail-value-muted'}>
            {topic.observed ? '예' : '아니오'}
          </strong>
        </div>
      </DetailSection>

      <DetailSection collapsible title="장치 상태 값">
        <KeyValueTable values={values} />
      </DetailSection>

      <DetailSection collapsible title="원본 Preview JSON">
        <pre className="preview-json">
          {preview ? JSON.stringify(preview, null, 2) : 'preview 없음'}
        </pre>
      </DetailSection>
    </aside>
  )
}

function DetailLine({ label, tone, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong className={detailValueClass(tone)}>{value}</strong>
    </div>
  )
}

function Metric({ label, tone, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={detailValueClass(tone)}>{value}</strong>
    </div>
  )
}

function detailValueClass(tone) {
  return tone ? `detail-value-${tone}` : undefined
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
