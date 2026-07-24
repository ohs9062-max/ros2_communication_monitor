import { formatMs, formatRelativeTime, formatTime } from '../utils/format.js'
import { ConnectionNodeList } from './ConnectionNodeList.jsx'
import { DetailSection } from './DetailSection.jsx'
import { StatusBadge } from './StatusBadge.jsx'

export function ServiceDetailPanel({ participants, service }) {
  if (!service) {
    return (
      <aside className="detail-panel">
        <div className="empty-state">
          발견된 Service가 있으면 상세 정보가 표시됩니다
        </div>
      </aside>
    )
  }

  const callSummary = service.last_call_summary

  return (
    <aside className="detail-panel">
      <div className="panel-heading">
        <span>Service 상세</span>
        <StatusBadge value={service.status} />
      </div>
      <h2>{service.name}</h2>
      <p className="muted">{service.type ?? '-'}</p>

      {service.hidden_by_default === true && (
        <p className="notice-text">
          이 Service는 ROS2 내부/파라미터/Action 내부 Service로 기본 화면에서는
          숨겨집니다.
        </p>
      )}

      <DetailSection title="상태 요약">
        <DetailLine label="이름" value={service.name} />
        <DetailLine label="타입" value={service.type ?? '-'} />
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
      </DetailSection>

      <DetailSection collapsible title="연결 정보">
        <DetailLine label="서버 수" value={service.server_count ?? 0} />
        <DetailLine label="클라이언트 수" value={service.client_count ?? 0} />
        <p className="detail-help-text">
          요청자 Node는 요청을 보내고, 응답자 Node는 요청을 받아 응답합니다.
        </p>
        <ConnectionNodeList
          emptyText="응답자 Node 없음"
          items={participants?.servers ?? []}
          title="응답자 Node"
        />
        <ConnectionNodeList
          emptyText="요청자 Node 없음"
          items={participants?.clients ?? []}
          title="요청자 Node"
        />
      </DetailSection>

      <DetailSection collapsible title="사용자 Service Call">
        <DetailLine
          label="호출 가능"
          tone={service.callable ? 'good' : service.allowlisted ? 'warn' : 'muted'}
          value={service.callable ? '예' : service.allowlisted ? '등록됨' : '아니오'}
        />
        <DetailLine
          label="마지막 호출"
          value={formatRelativeTime(callSummary?.last_called_at)}
        />
        <DetailLine
          label="마지막 호출 상태"
          tone={statusTone(callSummary?.last_call_status)}
          value={callSummary?.last_call_status ?? '-'}
        />
        <DetailLine
          label="서버 전송"
          tone={callSummary?.sent_to_server === false ? 'warn' : 'muted'}
          value={
            callSummary
              ? callSummary.sent_to_server ? '예' : '아니오'
              : '-'
          }
        />
        {callSummary?.error_type === 'validation_error' && (
          <p className="notice-text warning">
            입력값이 타입과 맞지 않아 서버로 보내지 않았습니다.
          </p>
        )}
        <DetailLine
          label="호출 응답 시간"
          value={formatMs(callSummary?.last_response_time_ms)}
        />
        <DetailLine label="마지막 호출 오류" value={callSummary?.last_error ?? '-'} />
        <DetailLine label="호출 수" value={service.call_count ?? 0} />
        <DetailLine label="성공/실패" value={`${service.success_count ?? 0}/${service.failure_count ?? 0}`} />
      </DetailSection>

      <DetailSection collapsible title="상세 데이터">
        <details>
          <summary>마지막 요청 JSON</summary>
          <pre className="preview-json">
            {callSummary?.last_request_preview
              ? JSON.stringify(callSummary.last_request_preview, null, 2)
              : '데이터 없음'}
          </pre>
        </details>
        <details>
          <summary>마지막 응답 JSON</summary>
          <pre className="preview-json">
            {callSummary?.last_response_preview
              ? JSON.stringify(callSummary.last_response_preview, null, 2)
              : '데이터 없음'}
          </pre>
        </details>
        <details>
          <summary>최근 호출 History JSON</summary>
          <pre className="preview-json">
            {callSummary?.history
              ? JSON.stringify(callSummary.history, null, 2)
              : '데이터 없음'}
          </pre>
        </details>
      </DetailSection>
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
  if (
    ['error', 'critical', 'disconnected', 'failed', 'timeout'].includes(value)
  ) {
    return 'bad'
  }
  if (['accepted', 'executing'].includes(value)) {
    return 'info'
  }
  return 'muted'
}
