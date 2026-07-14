# WebSocket 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

`/ws/monitor` 연결, 1초 주기 `monitor_snapshot`, 연결 관리,
Frontend 수신과 Header 상태 표시, REST와의 차이를 설명한다.

WebSocket은 raw ROS2 메시지가 아니라 각 Runtime cache의 가벼운 count/meta를
전송하는 보조 채널이다.

## 2. 전체 흐름

```text
Frontend WebSocket(url)
→ FastAPI /ws/monitor
→ WebSocketManager.connect
→ RosMonitor.websocket_snapshot
→ send_json
→ 1초 대기 후 반복
→ useMonitorWebSocket state
→ Header / Visualization 연결 표시
```

## 3. Backend 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | 전송 간격 1초 정의 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` | L15 | `WEBSOCKET_INTERVAL_SEC` |
| 2 | endpoint와 연결 등록 | 같은 파일 | L130-L134 | `monitor_websocket` |
| 3 | snapshot 생성/전송 반복 | 같은 파일 | L135-L143 | `monitor_websocket` |
| 4 | disconnect 정리 | 같은 파일 | L144-L147 | `monitor_websocket` |
| 5 | 도메인 snapshot/meta 조립 | `backend/.../ros_monitor.py` | L117-L146 | `websocket_snapshot` |
| 6 | Topic 요약 | 같은 파일 | L198-L228 | `_websocket_topic_meta` |
| 7 | Service/Action/Node 요약 | 같은 파일 | L230-L290 | `_websocket_*_meta` |
| 8 | accept/client set 등록 | `backend/.../websocket_manager.py` | L10-L24 | `connect`, `disconnect` |
| 9 | JSON 전송과 오류 처리 | 같은 파일 | L26-L38 | `send_json` |

payload 최상위는 `type`, `timestamp`, `data`이며 `type`은
`monitor_snapshot`이다. `data`는 topics/services/actions/nodes의 meta와
`alerts`의 현재 배열을 포함한다(`ros_monitor.py` L126-L145).

## 4. Frontend 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수 |
|---|---|---|---|---|
| 1 | HTTP base를 ws/wss URL로 변환 | `frontend/src/api/rosApi.js` | L1-L10 | `monitorWebSocketUrl` |
| 2 | 연결과 state 초기화 | `frontend/src/hooks/useMonitorWebSocket.js` | L6-L21 | `useMonitorWebSocket` |
| 3 | open/message/error/close 처리 | 같은 파일 | L23-L51 | effect 내부 callback |
| 4 | 2.5초 후 재연결 | 같은 파일 | L4, L44-L51 | `RECONNECT_DELAY_MS` |
| 5 | cleanup과 socket close | 같은 파일 | L54-L63 | effect cleanup |
| 6 | App 전체에서 hook 1회 생성 | `frontend/src/App.jsx` | L20-L33 | `App` |
| 7 | Header 연결 상태 표시 | `frontend/src/layout/Header.jsx` | L3-L29 | `Header` |
| 8 | Visualization pill 표시 | `frontend/src/pages/VisualizationPage.jsx` | L364-L370 | `RealtimePill` |

## 5. REST와의 차이

| 구분 | REST | WebSocket |
|---|---|---|
| 주 데이터 | 목록, 상세, latest, Hz | count/meta와 Alert snapshot |
| 호출 주체 | Frontend polling/refresh | 연결 후 backend 반복 전송 |
| raw ROS2 메시지 | 제공하지 않음 | 제공하지 않음 |
| 연결 끊김 | 각 fetch error | hook이 disconnected 후 재연결 |
| 화면 동작 | 실제 table/detail 데이터 원본 | 실시간 연결 표시와 요약 보조 |

Frontend의 table/detail은 WebSocket payload로 대체되지 않고 REST polling을
계속 사용한다.

## 6. 발표 때 설명할 문장

“REST가 상세 데이터의 기준이고 WebSocket은 1초마다 가벼운 상태 요약을 보내
연결 상태와 실시간성을 보조합니다.”

## 7. 헷갈리기 쉬운 부분

- WebSocket 연결 성공이 ROS2 데이터가 정상이라는 뜻은 아니다.
- `lastMessage`는 raw Topic message가 아니라 JSON 문자열 snapshot이다.
- Header가 “REST polling 사용 중”이라고 보여도 목록 기능은 계속 동작한다.
- 한 client 전송 실패는 manager에서 해당 client만 제거한다.

## 8. 관련 파일 빠른 참조

`main.py`, `ros_monitor.py`, `websocket_manager.py`, `rosApi.js`,
`useMonitorWebSocket.js`, `App.jsx`, `Header.jsx`, `VisualizationPage.jsx`
