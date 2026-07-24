# WebSocket 흐름

## 무엇을 하는가

`/ws/monitor`는 Backend와 Frontend 사이의 실시간 연결 상태와 가벼운 monitor 요약을 전달한다. 상세 REST API를 대체하는 통신 경로는 아니다.

## Backend 전송 데이터

`RosMonitor.websocket_snapshot()`은 다음 형식의 snapshot을 만든다.

```text
type: monitor_snapshot
timestamp
data:
  topics: count와 상태 요약
  services: count와 상태 요약
  actions: count와 상태 요약
  nodes: count와 상태 요약
  alerts: 현재 Alert 목록
```

Topic 전체 메시지나 모든 관계 배열을 WebSocket으로 계속 보내지 않는다. 목록과 상세 데이터는 각 REST API가 담당한다.

## REST와 역할 차이

| 방식 | 역할 |
|---|---|
| REST | 화면별 목록, 상세 상태, latest, Hz, 관계 데이터 |
| WebSocket | 실시간 연결 표시와 가벼운 통합 snapshot |

따라서 WebSocket이 잠깐 재연결 중이어도 REST polling으로 화면 데이터가 표시될 수 있다. Visualization도 관계 그래프의 원본은 REST에서 가져온다.

## Frontend 연결

`useMonitorWebSocket()`은 다음 상태를 관리한다.

- `connecting`
- `connected`
- `error`
- `disconnected`

메시지를 받으면 JSON을 파싱해 `snapshot`과 `lastUpdatedAt`을 갱신한다. 연결이 닫히면 2.5초 뒤 재연결을 시도한다. hook cleanup에서는 재연결 timer를 지우고 현재 socket을 닫아 페이지 생명주기와 충돌하지 않게 한다.

## reload 때의 동작

Uvicorn worker가 reload되면 기존 WebSocket은 종료된다.

```text
기존 worker shutdown
→ socket close
→ Frontend disconnected
→ 새 worker와 ROS Runtime startup
→ 재연결 timer
→ connected
```

짧은 끊김 자체는 예상할 수 있지만 새 worker가 준비된 뒤에도 연결이 돌아오지 않으면 Backend startup과 Frontend hook을 나눠 확인해야 한다.

## 담당 파일

- `routers/monitoring.py`: `/ws/monitor`
- `ros_monitor.py`: `websocket_snapshot()`
- `frontend/src/hooks/useMonitorWebSocket.js`: 연결과 재연결
- `frontend/src/layout/Header.jsx`: 연결 상태 표시

## 문제가 생기면

1. `/health`가 계속 성공하는지 확인
2. 브라우저 Network에서 WebSocket close code와 재연결 확인
3. Uvicorn worker PID 변경 시각 확인
4. 새 Backend에서 `RosMonitor.start()`가 완료됐는지 확인
5. REST는 정상인데 WebSocket만 실패하는지 구분
