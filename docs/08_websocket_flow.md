# WebSocket 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. WebSocket이 필요한 이유

목록과 상세 데이터는 REST polling으로 충분하지만, 화면이 Backend와 계속 연결되어
있는지와 가벼운 상태 요약은 연결을 유지하며 받는 편이 편리합니다. `/ws/monitor`는
이를 위한 보조 채널입니다. raw ROS2 메시지가 아니라 Runtime cache에서 만든 count,
meta, Alert 요약만 1초마다 보냅니다.

## 2. Backend 연결과 전송

```text
Frontend가 WebSocket URL 생성 후 연결
  — rosApi.js L1-L10, monitorWebSocketUrl()
  — useMonitorWebSocket.js L6-L21

→ FastAPI가 /ws/monitor endpoint 호출
  — main.py L130-L132
  — monitor_websocket(websocket)

→ 연결 accept와 client set 등록
  — main.py L133
  — websocket_manager.py L17-L24, connect()

→ Runtime cache에서 경량 snapshot 생성
  — main.py L135-L139
  — ros_monitor.py L117-L146, websocket_snapshot()

→ JSON 전송
  — websocket_manager.py L26-L38, send_json()

→ 1초 동안 다른 작업에 실행권을 주고 반복
  — main.py L143, asyncio.sleep()

→ disconnect 또는 전송 실패 시 client 제거
  — main.py L144-L147
  — websocket_manager.py L22-L38
```

`monitor_websocket()`은 연결 객체를 전달받습니다. `await connect()`로 연결을 받고,
반복문에서 `websocket_snapshot()` 결과를 `await send_json()`에 전달합니다.
`await`는 네트워크 전송이나 1초 대기 동안 서버 전체를 멈추지 않고 다른 요청을
처리할 수 있게 합니다.

payload 최상위 key는 `type`, `timestamp`, `data`이고 `type`은
`monitor_snapshot`입니다. `data`에는 topics/services/actions/nodes의 요약과 현재
alerts 배열이 있습니다(`ros_monitor.py` L126-L145).

## 3. Frontend 수신과 재연결

```text
useMonitorWebSocket()이 WebSocket 객체 생성
  — useMonitorWebSocket.js L6-L21

→ open/message/error/close callback 등록
  — useMonitorWebSocket.js L23-L51

→ message JSON을 snapshot state에 저장
  — useMonitorWebSocket.js L29-L40

→ 연결 종료 시 2.5초 뒤 재연결
  — useMonitorWebSocket.js L4, L44-L51

→ App가 Header와 Visualization에 state 전달
  — App.jsx L20-L33, L61-L63
  — Header.jsx L3-L29
  — VisualizationPage.jsx L364-L370
```

callback은 open이나 message 같은 browser 사건이 생겼을 때 나중에 실행되는
함수입니다. component가 사라질 때 cleanup은 socket을 닫고 재연결 timer를
정리합니다(`useMonitorWebSocket.js` L54-L63).

## 4. REST와 무엇이 다른가

REST와 WebSocket은 같은 Runtime cache를 읽지만 결과 모양과 역할이 다릅니다.

| REST | WebSocket |
|---|---|
| 목록, latest, Hz, 상세 데이터 | count/meta와 Alert 요약 |
| Frontend가 polling | Backend가 연결 후 1초마다 전송 |
| table/detail의 기준 데이터 | 연결 상태와 실시간 요약 보조 |

WebSocket 1초는 Backend Graph 갱신 주기가 아닙니다. 연결 성공도 ROS2 Topic이나
Node가 정상이라는 뜻은 아닙니다. `lastMessage` 역시 raw Topic message가 아니라
JSON monitor snapshot입니다.

## 5. 전체 흐름 한 문장

Frontend가 `/ws/monitor`에 연결하면 FastAPI가 같은 Runtime cache의 경량 요약을
1초마다 보내고 React callback이 연결 상태와 snapshot을 갱신합니다.

## 초보자가 자주 틀리는 부분

- WebSocket은 REST table 데이터를 대체하지 않습니다.
- WebSocket async loop와 ROS2 spin thread는 서로 다른 실행 구조입니다.
- 한 client 전송 실패는 manager가 해당 client만 제거합니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `/ws/monitor`는 raw ROS2 메시지가 아닌 경량 요약 채널입니다.
2. REST와 WebSocket은 같은 Runtime cache를 서로 다른 형태로 읽습니다.
3. 상세 화면의 기준 데이터는 계속 REST polling입니다.
