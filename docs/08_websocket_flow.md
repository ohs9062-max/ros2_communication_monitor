# WebSocket 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. WebSocket 역할

`/ws/monitor`는 raw ROS2 message stream이 아니다. Backend 연결 상태와 count/meta/alert 요약을 1초마다 보내는 경량 보조 채널이다. 상세 목록과 latest/hz는 REST polling이 기준이다.

## 2. Backend 코드 추적

```text
Frontend WebSocket 연결
→ monitoring router의 /ws/monitor
→ WebSocketManager.connect()
→ RosMonitor.websocket_snapshot()
→ WebSocketManager.send_json()
→ disconnect/오류 시 client 제거
```

| 단계 | 코드 위치 |
|---|---|
| `/ws/monitor` endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L92 |
| WebSocket handler | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L93 |
| snapshot 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L336 |
| WebSocketManager | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/websocket_manager.py` L10 |
| connect | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/websocket_manager.py` L17 |
| disconnect | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/websocket_manager.py` L22 |
| send_json | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/websocket_manager.py` L26 |

## 3. Frontend 코드 추적

```text
monitorWebSocketUrl()
→ useMonitorWebSocket()
→ open/message/error/close callback
→ App state
→ Header와 VisualizationPage에 전달
```

| 단계 | 코드 위치 |
|---|---|
| WebSocket URL 생성 | `frontend/src/api/rosApi.js` L15 |
| WebSocket hook | `frontend/src/hooks/useMonitorWebSocket.js` L6 |
| URL memo | `frontend/src/hooks/useMonitorWebSocket.js` L12 |
| App에서 hook 사용 | `frontend/src/App.jsx` L20 |
| Header 연결 상태 표시 | `frontend/src/layout/Header.jsx` L3 |
| Visualization에 snapshot 전달 | `frontend/src/pages/VisualizationPage.jsx` L11 |

## 4. 정책

- WebSocket reconnect는 기존 socket과 timer cleanup을 전제로 한다.
- WebSocket 메시지를 받을 때마다 latest/hz REST fetch를 직접 유발하지 않는다.
- WebSocket 연결 성공은 ROS2 장비나 특정 Topic 정상 상태를 의미하지 않는다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `/ws/monitor`는 raw ROS2 메시지가 아니라 경량 요약 채널이다.
2. REST와 WebSocket은 같은 runtime cache를 서로 다른 형태로 읽는다.
3. 상세 화면의 기준 데이터는 계속 REST polling이다.
