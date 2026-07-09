import { formatMs, formatRelativeTime, formatTime } from '../utils/format.js'
import { StatusBadge } from './StatusBadge.jsx'

export function ActionDetailPanel({ action }) {
  if (!action) {
    return (
      <aside className="detail-panel">
        <div className="empty-state">
          발견된 Action이 있으면 상세 정보가 표시됩니다
        </div>
      </aside>
    )
  }

  const runtime = action.runtime ?? {}
  const goalUnobserved = (runtime.observed_goal_count ?? 0) === 0

  return (
    <aside className="detail-panel">
      <div className="panel-heading">
        <span>Action 상세</span>
        <StatusBadge value={action.status} />
      </div>
      <h2>{action.name}</h2>
      <p className="muted">{action.type ?? '-'}</p>

      {action.result_policy === 'observed_goal_only' && (
        <p className="notice-text">
          Result는 백엔드가 새 Goal을 보내지 않고, status topic에서 관찰한
          종료 goal_id에 대해서만 조회합니다.
        </p>
      )}
      {goalUnobserved && (
        <p className="notice-text">
          아직 관찰된 Goal이 없습니다. 외부 Action Client가 Goal을 보내면 상태,
          Feedback, Result, 실행 시간이 여기에 표시됩니다.
        </p>
      )}
      {action.feedback_supported === false && (
        <p className="notice-text">
          이 Action의 feedback type을 현재 백엔드 환경에서 해석할 수 없습니다.
        </p>
      )}
      {action.result_supported === false && (
        <p className="notice-text">
          이 Action의 result type을 현재 백엔드 환경에서 해석할 수 없습니다.
        </p>
      )}
      {runtime.last_goal_status === 'aborted' && (
        <p className="error-text">
          이 Action은 실패 종료되었습니다. 상세 원인은 Feedback 또는 Result
          message를 확인하세요.
        </p>
      )}

      <section className="detail-section">
        <h3>상태 요약</h3>
        <DetailLine label="상태" value={action.status ?? '-'} />
        <DetailLine label="상태 이유" value={action.reason ?? '-'} />
        <DetailLine label="타입" value={action.type ?? '-'} />
      </section>

      <section className="detail-section">
        <h3>연결 정보</h3>
        <DetailLine label="서버 수" value={action.server_count ?? 0} />
        <DetailLine label="클라이언트 수" value={action.client_count ?? 0} />
        <DetailLine label="Status Topic" value={action.status_topic ?? '-'} />
        <DetailLine label="Feedback Topic" value={action.feedback_topic ?? '-'} />
        <DetailLine
          label="마지막 갱신"
          value={formatTime(action.last_updated)}
        />
      </section>

      <section className="detail-section">
        <h3>지원 상태</h3>
        <DetailLine
          label="Status 구독"
          value={action.status_supported ? '지원' : '미지원'}
        />
        <DetailLine
          label="Feedback"
          value={action.feedback_supported ? '지원' : '미지원'}
        />
        <DetailLine
          label="Feedback 이유"
          value={action.feedback_reason ?? '-'}
        />
        <DetailLine
          label="Result"
          value={action.result_supported ? resultLabel(action) : '미지원'}
        />
        <DetailLine label="Result 정책" value={action.result_policy ?? '-'} />
        <DetailLine label="Result 이유" value={action.result_reason ?? '-'} />
      </section>

      <section className="detail-section">
        <h3>Runtime</h3>
        <DetailLine
          label="마지막 Goal 상태"
          value={
            runtime.last_goal_status === 'unknown'
              ? 'Goal 미관찰'
              : runtime.last_goal_status ?? '-'
          }
        />
        <DetailLine label="마지막 Goal ID" value={runtime.last_goal_id ?? '-'} />
        <DetailLine
          label="마지막 Status"
          value={formatRelativeTime(runtime.last_status_at)}
        />
        <DetailLine
          label="마지막 Feedback"
          value={formatRelativeTime(runtime.last_feedback_at)}
        />
        <DetailLine
          label="Elapsed"
          value={formatMs(runtime.elapsed_time_ms)}
        />
        <DetailLine
          label="관찰 Goal 수"
          value={runtime.observed_goal_count ?? 0}
        />
        <DetailLine label="Result 상태" value={runtime.result_status ?? '-'} />
        <DetailLine label="Result 오류" value={runtime.result_error ?? '-'} />
      </section>

      <PreviewSection
        title="Feedback 미리보기 JSON"
        value={runtime.feedback_preview}
      />
      <PreviewSection
        title="Result 미리보기 JSON"
        value={runtime.result_preview}
      />
    </aside>
  )
}

function DetailLine({ label, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PreviewSection({ title, value }) {
  return (
    <section className="detail-section">
      <details>
        <summary>{title}</summary>
        <pre className="preview-json">
          {value ? JSON.stringify(value, null, 2) : '데이터 없음'}
        </pre>
      </details>
    </section>
  )
}

function resultLabel(action) {
  if (action.result_policy === 'observed_goal_only') {
    return '관찰된 Goal만 조회'
  }

  return '지원'
}
