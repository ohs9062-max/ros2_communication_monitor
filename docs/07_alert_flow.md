# Alert 통합 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. 상태 badge와 Alert를 나누는 이유

목록의 badge는 현재 관찰 상태를 넓게 보여준다. Alert는 그중 사용자가 조치해야 할 가능성이 높은 조건만 선별한다. 따라서 badge 개수와 Alert count가 달라도 정상이다.

예를 들어 Service가 `waiting_server`인 것은 상태 badge로는 의미가 있지만, 항상 장애 Alert는 아니다. 반대로 MonitorStatus message가 `critical`이면 Topic 목록의 한 항목에서 나온 정보라도 `/ros/alerts` 통합 목록에 올라온다.

## 2. Alert 생성 코드 추적

```text
REST 또는 WebSocket이 alert 요청
→ RosMonitor.alerts()
→ Topic/MonitorStatus alert 생성
→ Service alert 생성
→ Action alert 생성
→ Node alert 생성
→ level별 meta와 배열 반환
```

| 단계 | 코드 위치 |
|---|---|
| alert 통합 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L376 |
| Topic/MonitorStatus alert | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/alerts.py` L37 |
| alert meta | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/alerts.py` L66 |
| Service alert | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/alerts.py` L37 |
| Action alert | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/alerts.py` L18 |
| Node alert | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/alerts.py` L14 |
| `/ros/alerts` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L86 |
| WebSocket snapshot 내 alerts | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L336 |

## 3. Frontend 표시 코드 추적

| 단계 | 코드 위치 |
|---|---|
| alerts API 함수 | `frontend/src/api/rosApi.js` L57 |
| Topic dashboard에서 공통 polling | `frontend/src/hooks/useTopicDashboard.js` L16 |
| Overview 표시 | `frontend/src/pages/OverviewPage.jsx` L12 |
| Alerts page | `frontend/src/pages/AlertsPage.jsx` L3 |
| Alert list component | `frontend/src/components/AlertsList.jsx` L19 |

## 4. `/ros/alerts`를 라인으로 따라가기

```text
Frontend Overview 또는 Alerts 화면
→ GET /ros/alerts
→ routers/monitoring.py L86 @router.get('/ros/alerts')
→ routers/monitoring.py L87 get_ros_alerts()
→ L89 ros_monitor.alerts()
→ ros_monitor.py L376 RosMonitor.alerts()
→ L379 service alert input 읽기
→ L380 action snapshot 읽기
→ L381 topic alert input 읽기
→ L382-L383 node snapshot 읽기
→ topic/service/action/node alert builder 호출
→ level별 meta와 alert 배열 반환
```

Alert는 DB에 저장된 이력이 아니라 "지금 snapshot 기준으로 조립한 결과"다. 따라서 runtime cache가 바뀌면 다음 조회에서 alert 목록도 바뀐다.

## 5. WebSocket 안의 Alert 흐름

```text
Frontend WebSocket 연결
→ routers/monitoring.py L92 /ws/monitor
→ ros_monitor.py L336 websocket_snapshot()
→ ros_monitor.py L343 alerts = self.alerts()
→ ros_monitor.py L364 alerts를 monitor_snapshot에 포함
→ Frontend가 header/overview 요약에 반영
```

WebSocket의 alerts도 `/ros/alerts`와 같은 정책을 사용하지만, 상세 조회가 아니라 경량 요약 snapshot 안에 포함되는 값이다.

## 6. 정책

- Topic: required stream publisher 없음, 장기 미수신, stale, MonitorStatus warning/error/critical.
- Service: allowlist active check의 timeout/error/failed.
- Action: aborted, canceled, result lookup error.
- Node: stale.
- 일반 Topic subscriber 없음, Service waiting server, Action Goal 미관찰은 기본 Alert가 아니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Alert는 Runtime 상태 중 정책에 맞는 조건만 선별한다.
2. Topic, Service, Action, Node Alert는 `/ros/alerts` 하나로 통합된다.
3. 현재 구현은 DB에 Alert 이력을 저장하지 않고 snapshot 시점에 조립한다.
