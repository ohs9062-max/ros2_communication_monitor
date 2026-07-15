import { formatTime } from '../utils/format.js'
import { InterfaceUploadControl } from '../components/InterfaceUploadControl.jsx'

export function Header({ activePage, health, lastUpdated, onNavigate, websocket }) {
  const connected = Boolean(health.data?.success) && !health.error
  const realtime = websocketStatus(websocket?.status)

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
        <span className={`ws-status ${realtime.tone}`}>
          <span className={`dot ${realtime.dot}`} />
          {realtime.label}
        </span>
        {activePage === 'overview' && <InterfaceUploadControl />}
        <span className="muted">마지막 갱신: {formatTime(lastUpdated)}</span>
        <span className="muted">
          {websocket?.connected
            ? `실시간 갱신: ${formatTime(websocket.lastUpdatedAt)}`
            : 'REST polling 사용 중'}
        </span>
      </div>
    </header>
  )
}

function websocketStatus(status) {
  if (status === 'connected') {
    return {
      dot: 'connected',
      label: '실시간 연결됨',
      tone: 'connected',
    }
  }
  if (status === 'connecting') {
    return {
      dot: 'connecting',
      label: '실시간 연결 중',
      tone: 'connecting',
    }
  }

  return {
    dot: 'fallback',
    label: '실시간 끊김',
    tone: 'fallback',
  }
}
