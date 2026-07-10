import { formatMs, formatRelativeTime, formatTime } from '../utils/format.js'
import { StatusBadge } from './StatusBadge.jsx'

export function ServiceDetailPanel({ service }) {
  if (!service) {
    return (
      <aside className="detail-panel">
        <div className="empty-state">
          발견된 Service가 있으면 상세 정보가 표시됩니다
        </div>
      </aside>
    )
  }

  const activeCheck = service.active_check ?? {}

  return (
    <aside className="detail-panel">
      <div className="panel-heading">
        <span>Service 상세</span>
        <StatusBadge value={service.status} />
      </div>
      <h2>{service.name}</h2>
      <p className="muted">{service.type ?? '-'}</p>

      {service.active_check_supported === false && (
        <p className="notice-text">
          상태만 표시합니다. 이 Service는 안전 호출 목록에 등록되어 있지 않아
          호출 결과와 응답 시간을 측정하지 않습니다. 목록과 서버 상태만
          모니터링합니다.
        </p>
      )}
      {service.hidden_by_default === true && (
        <p className="notice-text">
          이 Service는 ROS2 내부/파라미터/Action 내부 Service로 기본 화면에서는
          숨겨집니다.
        </p>
      )}

      <section className="detail-section">
        <h3>상태 요약</h3>
        <DetailLine label="분류" value={service.category ?? '-'} />
        <DetailLine
          label="기본 숨김"
          value={service.hidden_by_default ? '예' : '아니오'}
        />
        <DetailLine
          label="상태"
          tone={statusTone(service.status)}
          value={service.status ?? '-'}
        />
        <DetailLine label="상태 이유" value={service.reason ?? '-'} />
        <DetailLine label="마지막 갱신" value={formatTime(service.last_updated)} />
      </section>

      <section className="detail-section">
        <h3>연결 정보</h3>
        <DetailLine label="서버 수" value={service.server_count ?? 0} />
        <DetailLine label="클라이언트 수" value={service.client_count ?? 0} />
      </section>

      <section className="detail-section">
        <h3>응답 측정</h3>
        <DetailLine
          label="측정 지원"
          tone={service.active_check_supported ? 'good' : 'muted'}
          value={service.active_check_supported ? '예' : '아니오 (상태만 표시)'}
        />
        <DetailLine
          label="마지막 상태"
          tone={statusTone(activeCheck.last_status)}
          value={activeCheck.last_status ?? '-'}
        />
        <DetailLine
          label="응답 시간"
          value={formatMs(activeCheck.last_response_time_ms)}
        />
        <DetailLine label="제한 시간" value={activeCheck.timeout_sec ?? '-'} />
        <DetailLine
          label="마지막 측정"
          value={formatRelativeTime(activeCheck.last_checked_at)}
        />
        <DetailLine label="오류 메시지" value={activeCheck.error_message ?? '-'} />
        <DetailLine label="측정 이유" value={activeCheck.reason ?? '-'} />
      </section>

      <section className="detail-section">
        <details open>
          <summary>응답 미리보기 JSON</summary>
          <pre className="preview-json">
            {activeCheck.response_preview
              ? JSON.stringify(activeCheck.response_preview, null, 2)
              : '미리보기 없음'}
          </pre>
        </details>
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

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['active', 'success', 'succeeded'].includes(value)) {
    return 'good'
  }
  if (['warning', 'waiting_server', 'pending'].includes(value)) {
    return 'warn'
  }
  if (['error', 'critical', 'failed', 'timeout'].includes(value)) {
    return 'bad'
  }
  if (['accepted', 'executing'].includes(value)) {
    return 'info'
  }
  return 'muted'
}
