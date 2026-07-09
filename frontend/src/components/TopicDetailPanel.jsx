import { formatAge, formatNumber, formatTime } from '../utils/format.js'
import { KeyValueTable } from './KeyValueTable.jsx'
import { StatusBadge } from './StatusBadge.jsx'

export function TopicDetailPanel({ topic, latest, hz }) {
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
  const preview = latestData?.message_preview
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
          이 Topic은 아직 메시지를 수신하지 않았습니다. Publisher가 메시지를
          발행 중인지 확인하세요.
        </p>
      )}

      <section className="detail-section">
        <h3>상태 요약</h3>
        <div className="detail-line">
          <span>상태</span>
          <strong>{topic.status ?? '-'}</strong>
        </div>
        <div className="detail-line">
          <span>상태 이유</span>
          <strong>{topic.reason ?? '-'}</strong>
        </div>
        <div className="detail-line">
          <span>타입</span>
          <strong>{topic.types?.[0] ?? '-'}</strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>수신 정보</h3>
        <div className="metric-grid">
          <Metric label="Hz" value={formatNumber(hzData?.hz)} />
          <Metric label="수신 여부" value={hzData?.received ? '예' : '아니오'} />
          <Metric label="메시지 수" value={hzData?.message_count ?? '-'} />
          <Metric label="경과 시간" value={formatAge(hzData?.age_sec)} />
          <Metric label="오래됨" value={hzData?.is_stale ? '예' : '아니오'} />
          <Metric label="상태" value={hzData?.status ?? '-'} />
        </div>
      </section>

      <section className="detail-section">
        <h3>연결 정보</h3>
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
          <strong>{topic.deep_monitoring ? '예' : '아니오'}</strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>최신 메시지</h3>
        <div className="detail-line">
          <span>수신 여부</span>
          <strong>{latestData?.received ? '예' : '아니오'}</strong>
        </div>
        <div className="detail-line">
          <span>마지막 수신</span>
          <strong>{formatTime(latestData?.last_received_at)}</strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>장치 상태 값</h3>
        <KeyValueTable values={values} />
      </section>

      <section className="detail-section">
        <details>
          <summary>원본 메시지 preview JSON</summary>
          <pre className="preview-json">
            {preview ? JSON.stringify(preview, null, 2) : 'preview 없음'}
          </pre>
        </details>
      </section>
    </aside>
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
