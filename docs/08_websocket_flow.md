# WebSocket 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. WebSocket 역할

`/ws/monitor`는 raw ROS2 message stream이 아니다. Backend 연결 상태와 count/meta/alert 요약을 1초마다 보내는 경량 보조 채널이다. 상세 목록과 latest/hz는 REST polling이 기준이다.

즉 WebSocket은 "모든 ROS2 메시지를 실시간으로 밀어주는 통로"가 아니라, Dashboard가 전체 상태 변화를 빠르게 감지하기 위한 보조 신호다. Topic payload 상세, Hz, Service 상세, Action 상세은 계속 REST endpoint를 기준으로 읽는다.

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

## 4. Backend WebSocket을 라인으로 따라가기

```text
Frontend WebSocket 생성
→ ws://.../ws/monitor
→ routers/monitoring.py L92 @router.websocket('/ws/monitor')
→ routers/monitoring.py L93 monitor_websocket(websocket)
→ L95 websocket_manager.connect(websocket)
→ L97 while True
→ L98-L101 websocket_manager.send_json(websocket, ros_monitor.websocket_snapshot())
→ ros_monitor.py L336 RosMonitor.websocket_snapshot()
→ ros_monitor.py L339-L343 topics/services/actions/nodes/alerts snapshot 읽기
→ ros_monitor.py L345-L366 monitor_snapshot payload 조립
→ routers/monitoring.py L105 1초 대기
→ 연결 종료 시 L106-L109 disconnect
```

WebSocket handler는 루프 안에서 직접 ROS2 Graph API를 호출하지 않는다. `websocket_snapshot()`이 REST와 같은 runtime cache 계층을 읽어 경량 구조로 바꾼다.

## 5. Frontend WebSocket을 라인으로 따라가기

```text
frontend/src/api/rosApi.js L15 monitorWebSocketUrl()
→ frontend/src/hooks/useMonitorWebSocket.js L6 hook 시작
→ L12 URL memo
→ WebSocket open/message/error/close callback 등록
→ frontend/src/App.jsx L20 근처에서 hook 사용
→ Header와 VisualizationPage에 연결 상태와 snapshot 전달
```

Frontend는 WebSocket reconnect가 생겨도 REST polling interval을 중복 생성하지 않도록 hook cleanup을 유지해야 한다.

## 6. 정책

- WebSocket reconnect는 기존 socket과 timer cleanup을 전제로 한다.
- WebSocket 메시지를 받을 때마다 latest/hz REST fetch를 직접 유발하지 않는다.
- WebSocket 연결 성공은 ROS2 장비나 특정 Topic 정상 상태를 의미하지 않는다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `/ws/monitor`는 raw ROS2 메시지가 아니라 경량 요약 채널이다.
2. REST와 WebSocket은 같은 runtime cache를 서로 다른 형태로 읽는다.
3. 상세 화면의 기준 데이터는 계속 REST polling이다.
