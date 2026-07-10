function statusClass(value) {
  const status = String(value || 'unknown').toLowerCase()
  if (
    status === 'active' ||
    status === 'connected' ||
    status === 'success' ||
    status === 'succeeded' ||
    status === 'feedback_received' ||
    status === 'supported'
  ) {
    return 'badge green'
  }
  if (
    status === 'warning' ||
    status === 'stale' ||
    status === 'no_subscriber' ||
    status === 'waiting_publisher' ||
    status === 'waiting_server' ||
    status === 'type_mismatch' ||
    status === 'pending' ||
    status === 'canceling' ||
    status === 'canceled' ||
    status === 'observed_goal_only'
  ) {
    return 'badge yellow'
  }
  if (
    status === 'accepted' ||
    status === 'executing' ||
    status === 'result_waiting' ||
    status === 'feedback_waiting' ||
    status === 'feedback_supported'
  ) {
    return 'badge blue'
  }
  if (
    status === 'error' ||
    status === 'critical' ||
    status === 'failed' ||
    status === 'aborted' ||
    status === 'unavailable' ||
    status === 'timeout' ||
    status === 'never_received' ||
    status === 'zero_hz' ||
    status === 'result_error' ||
    status === 'feedback_error'
  ) {
    return 'badge red'
  }
  return 'badge gray'
}

export function StatusBadge({ label, value }) {
  return <span className={statusClass(value)}>{label ?? statusLabel(value)}</span>
}

function statusLabel(value) {
  const status = String(value || 'unknown').toLowerCase()
  const labels = {
    active: '정상',
    connected: '연결됨',
    warning: '주의',
    stale: '수신 지연',
    no_subscriber: '구독자 없음',
    waiting_publisher: '발행자 대기',
    waiting_server: '서버 대기',
    success: '응답 성공',
    failed: '응답 실패',
    timeout: 'Timeout',
    type_mismatch: '타입 불일치',
    pending: '진행 중',
    accepted: 'Goal 수락',
    executing: '실행 중',
    canceling: '취소 중',
    succeeded: '성공',
    canceled: '취소됨',
    aborted: '실패 종료',
    unavailable: '사용 불가',
    disabled: '비활성',
    not_supported: '상태만 표시',
    supported: '지원',
    feedback_supported: '수신 가능',
    feedback_unsupported: '해석 불가',
    feedback_received: '수신됨',
    feedback_waiting: '대기 중',
    feedback_error: '수신 오류',
    feedback_none: '수신 없음',
    observed_goal_only: '관찰 Goal만 조회',
    user: '사용자',
    parameter: '파라미터',
    action_internal: 'Action 내부',
    ros_internal: 'ROS 내부',
    error: '오류',
    critical: '심각',
    inactive: '비활성',
    unknown: '알 수 없음',
    unsupported: '미지원',
    never_received: '아직 수신 없음',
    zero_hz: '0 Hz',
    low_hz: '낮은 Hz',
    normal_hz: '정상 Hz',
    goal_unobserved: 'Goal 미관찰',
    result_waiting: '결과 대기',
    result_none: '결과 없음',
    result_error: '결과 조회 오류',
    result_canceled: '취소됨',
  }
  return labels[status] ?? value ?? '알 수 없음'
}
