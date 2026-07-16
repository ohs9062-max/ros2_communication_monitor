import { formatMs, formatRelativeTime, formatTime } from '../utils/format.js'
import { ConnectionNodeList } from './ConnectionNodeList.jsx'
import { StatusBadge } from './StatusBadge.jsx'

export function ActionDetailPanel({ action, participants }) {
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
  const goalSummary = action.last_goal_summary
  const goalUnobserved = (runtime.observed_goal_count ?? 0) === 0 && !goalSummary
  const goalExecuting = runtime.last_goal_status === 'executing'
  const feedbackReceived = Boolean(runtime.feedback_preview)
  const feedbackWaiting =
    ['accepted', 'executing', 'canceling'].includes(
      String(runtime.last_goal_status || '').toLowerCase(),
    ) && !feedbackReceived

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
          결과 조회 정책: 관찰된 Goal만 조회합니다. 대시보드는 Goal을 직접
          보내지 않고, 상태 topic에서 관찰한 Goal이 종료되었을 때만 결과를
          조회합니다.
        </p>
      )}
      {goalUnobserved && (
        <p className="notice-text">
          아직 관찰된 Goal이 없어 피드백도 수신되지 않았습니다. 외부 Action
          Client가 Goal을 보내면 상태, 피드백, 결과, 실행 시간이 여기에
          표시됩니다.
        </p>
      )}
      {feedbackWaiting && (
        <p className="notice-text">
          현재 Goal이 실행 중이지만 아직 피드백 미리보기는 없습니다.
        </p>
      )}
      {feedbackReceived && (
        <p className="notice-text">
          최근 수신한 피드백 미리보기입니다.
        </p>
      )}
      {goalExecuting && (
        <p className="notice-text">
          현재 Goal이 실행 중이므로 최종 결과는 아직 없습니다. 실행이 끝나면
          결과가 표시됩니다.
        </p>
      )}
      {action.feedback_supported === false && (
        <p className="notice-text">
          이 Action의 피드백 타입을 현재 백엔드 환경에서 해석할 수 없습니다.
        </p>
      )}
      {action.result_supported === false && (
        <p className="notice-text">
          이 Action의 결과 타입을 현재 백엔드 환경에서 해석할 수 없습니다.
        </p>
      )}
      {runtime.last_goal_status === 'aborted' && (
        <p className="error-text">
          이 Action은 실패 종료되었습니다. 상세 원인은 피드백 또는 결과
          메시지를 확인하세요.
        </p>
      )}

      <section className="detail-section">
        <h3>상태 요약</h3>
        <DetailLine label="이름" value={action.name} />
        <DetailLine label="타입" value={action.type ?? '-'} />
        <DetailLine
          label="상태"
          tone={statusTone(action.status)}
          value={action.status ?? '-'}
        />
        <DetailLine label="상태 이유" value={action.reason ?? '-'} />
        <DetailLine label="마지막 갱신" value={formatTime(action.last_updated)} />
      </section>

      <section className="detail-section">
        <h3>연결 정보</h3>
        <DetailLine label="서버 수" value={action.server_count ?? 0} />
        <DetailLine label="클라이언트 수" value={action.client_count ?? 0} />
        <DetailLine label="상태 Topic" value={action.status_topic ?? '-'} />
        <DetailLine label="피드백 Topic" value={action.feedback_topic ?? '-'} />
        <p className="detail-help-text">
          Goal 요청자 Node는 Goal을 보내고, Goal 실행자 Node는 Goal을 받아
          실행합니다.
        </p>
        <ConnectionNodeList
          emptyText="Goal 실행자 Node 없음"
          items={participants?.servers ?? []}
          title="Goal 실행자 Node"
        />
        <ConnectionNodeList
          emptyText="Goal 요청자 Node 없음"
          items={participants?.clients ?? []}
          title="Goal 요청자 Node"
        />
      </section>

      <section className="detail-section">
        <h3>실행/측정 정보</h3>
        <DetailLine
          label="마지막 Goal 상태"
          tone={statusTone(runtime.last_goal_status)}
          value={
            goalSummary?.last_goal_status
              ? goalStatusLabel(goalSummary.last_goal_status)
              : runtime.last_goal_status === 'unknown'
              ? 'Goal 미관찰'
              : goalStatusLabel(runtime.last_goal_status)
          }
        />
        <DetailLine
          label="실행 가능"
          tone={action.callable ? 'good' : action.allowlisted ? 'warn' : 'muted'}
          value={action.callable ? '예' : action.allowlisted ? '등록됨' : '아니오'}
        />
        <DetailLine
          label="서버 전송"
          tone={goalSummary?.sent_to_server === false ? 'warn' : 'muted'}
          value={goalSummary ? goalSummary.sent_to_server ? '예' : '아니오' : '-'}
        />
        {goalSummary?.error_type === 'validation_error' && (
          <p className="notice-text warning">
            입력값이 타입과 맞지 않아 서버로 보내지 않았습니다.
          </p>
        )}
        <DetailLine
          label="마지막 Goal ID"
          value={runtime.last_goal_id ?? '-'}
        />
        <DetailLine
          label="마지막 상태 수신"
          value={formatRelativeTime(runtime.last_status_at)}
        />
        <DetailLine
          label="마지막 피드백"
          value={formatRelativeTime(runtime.last_feedback_at)}
        />
        <DetailLine
          label="실행 시간"
          value={formatMs(goalSummary?.execution_time_ms ?? runtime.elapsed_time_ms)}
        />
        <DetailLine
          label="관찰 Goal 수"
          value={runtime.observed_goal_count ?? 0}
        />
        <DetailLine
          label="결과 상태"
          tone={statusTone(runtime.result_status)}
          value={resultStatusLabel(runtime.result_status)}
        />
        <DetailLine label="결과 오류" value={runtime.result_error ?? '-'} />
        <DetailLine label="마지막 실행 오류" value={goalSummary?.last_error ?? '-'} />
        <DetailLine label="Goal 수" value={action.goal_count ?? 0} />
        <DetailLine label="성공/실패" value={`${action.success_count ?? 0}/${action.failure_count ?? 0}`} />
      </section>

      <section className="detail-section">
        <h3>상세 데이터</h3>
        <p className="muted detail-help-text">
          피드백 구독 지원 여부는 이 Action 타입의 피드백 메시지를
          대시보드가 해석할 수 있는지를 의미합니다. 실제 수신 여부는 실행 정보와
          피드백 미리보기에서 확인합니다.
        </p>
        <DetailLine
          label="상태 구독"
          value={action.status_supported ? '지원' : '미지원'}
        />
        <DetailLine
          label="피드백 구독"
          value={action.feedback_supported ? '지원' : '미지원'}
        />
        <DetailLine
          label="피드백 이유"
          value={action.feedback_reason ?? '-'}
        />
        <DetailLine
          label="결과"
          value={action.result_supported ? resultLabel(action) : '미지원'}
        />
        <DetailLine
          label="결과 조회 정책"
          value={resultPolicyLabel(action.result_policy)}
        />
        <DetailLine label="결과 이유" value={action.result_reason ?? '-'} />
      </section>

      <PreviewSection
        title="마지막 Goal JSON"
        value={goalSummary?.last_goal_preview}
      />
      <PreviewSection
        title="마지막 Feedback JSON"
        value={goalSummary?.last_feedback_preview}
      />
      <PreviewSection
        title="마지막 Result JSON"
        value={goalSummary?.last_result_preview}
      />
      <PreviewSection
        title="최근 Goal History JSON"
        value={goalSummary?.history}
      />
      <PreviewSection
        title="피드백 미리보기 JSON"
        value={runtime.feedback_preview}
      />
      <PreviewSection
        title="결과 미리보기 JSON"
        value={runtime.result_preview}
      />
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

function resultPolicyLabel(policy) {
  if (policy === 'observed_goal_only') {
    return '관찰된 Goal만 조회'
  }

  return policy ?? '-'
}

function goalStatusLabel(status) {
  const labels = {
    accepted: 'Goal 수락',
    executing: '실행 중',
    canceling: '취소 중',
    succeeded: '성공',
    canceled: '취소됨',
    aborted: '실패 종료',
  }

  return labels[String(status || '').toLowerCase()] ?? status ?? '-'
}

function resultStatusLabel(status) {
  const labels = {
    success: '성공',
    succeeded: '성공',
    aborted: '실패 종료',
    canceled: '취소됨',
    timeout: '시간 초과',
    error: '결과 조회 오류',
    unavailable: '결과 없음',
    pending: '결과 대기',
  }

  return labels[String(status || '').toLowerCase()] ?? status ?? '-'
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['active', 'success', 'succeeded'].includes(value)) {
    return 'good'
  }
  if (
    ['warning', 'waiting_server', 'pending', 'canceling', 'canceled'].includes(
      value,
    )
  ) {
    return 'warn'
  }
  if (['error', 'critical', 'failed', 'aborted', 'timeout'].includes(value)) {
    return 'bad'
  }
  if (['accepted', 'executing'].includes(value)) {
    return 'info'
  }
  return 'muted'
}
