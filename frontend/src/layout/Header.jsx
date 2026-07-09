import { formatTime } from '../utils/format.js'

export function Header({ health, lastUpdated, onNavigate }) {
  const connected = Boolean(health.data?.success) && !health.error

  return (
    <header className="header">
      <button
        className="header-title-button"
        onClick={() => onNavigate('overview')}
        type="button"
      >
        <p className="eyebrow">ROS2 대시보드</p>
        <h1>ROS2 Communication Monitor</h1>
      </button>
      <div className="header-status">
        <span className={connected ? 'dot connected' : 'dot disconnected'} />
        <span>백엔드: {connected ? '연결됨' : '연결 끊김'}</span>
        <span className="muted">마지막 갱신: {formatTime(lastUpdated)}</span>
        <span className="muted">1초마다 자동 갱신</span>
      </div>
    </header>
  )
}
