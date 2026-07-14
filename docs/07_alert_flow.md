# Alert 통합 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. 상태 badge와 Alert를 나누는 이유

목록의 badge는 현재 관찰 상태를 넓게 보여줍니다. 하지만 모든 대기·미지원 상태를
Alert로 만들면 사용자가 처리해야 할 문제를 찾기 어렵습니다. 그래서 Alert builder는
각 Runtime의 현재 상태 중 조치 가능성이 높은 조건만 골라 하나의 배열로 만듭니다.

## 2. Alert가 만들어지는 전체 순서

```text
REST 또는 WebSocket이 현재 Alert 요청
  — main.py L124-L127, L130-L143
  — get_ros_alerts(), RosMonitor.websocket_snapshot()

→ RosMonitor가 각 Runtime의 현재 snapshot 복사
  — ros_monitor.py L156-L163
  — RosMonitor.alerts()

→ Topic과 MonitorStatus Alert 생성
  — ros_monitor.py L165-L170
  — topic/alerts.py L37-L64, build_alerts()

→ Service Alert 추가
  — ros_monitor.py L171-L176
  — service/alerts.py L37-L88, build_service_alerts()

→ Action Alert 추가
  — ros_monitor.py L177-L182
  — action/alerts.py L18-L63, build_action_alerts()

→ Node Alert 추가
  — ros_monitor.py L183-L188
  — node/alerts.py L14-L41, build_node_alerts()

→ level별 meta와 공통 응답 반환
  — ros_monitor.py L190-L195
  — topic/alerts.py L66-L80, build_alert_meta()
```

`RosMonitor.alerts()`는 별도 인자를 받지 않고 현재 시각 `detected_at`과 각 Runtime
snapshot을 builder에 전달합니다. 결과는 저장 DB에 누적하지 않고 호출 시점마다
새로 조립합니다. 따라서 `detected_at`은 이번 snapshot 생성 시각이지 최초 장애
발생 시각이 아닙니다.

## 3. 어떤 상태가 Alert가 되는가

- Topic: required stream의 publisher 없음, 장기 미수신, stale
  (`topic/alerts.py` L83-L178)
- MonitorStatus: preview level이 warning/error/critical
  (`topic/alerts.py` L181-L237)
- Service: visible user Service의 allowlist active check가 timeout/error/failed
  (`service/alerts.py` L37-L88)
- Action: aborted, canceled, result lookup error
  (`action/alerts.py` L18-L63)
- Node: stale (`node/alerts.py` L14-L41)

required stream은 `/imu`, `/joint_states`, `/odom`, `/scan`입니다. 명령 Topic
`/cmd_vel`, `/cmd_vel_smoothed`는 명령이 있을 때만 흐를 수 있어 기본 미수신
Alert에서 제외됩니다.

일반 Topic의 subscriber 없음, Service waiting server, Action Goal 미관찰은 badge로
표시할 수 있지만 기본 Alert는 아닙니다. 따라서 badge 개수와 Alert count가 달라도
정상입니다.

## 4. REST와 화면 전달

```text
RosMonitor.alerts()가 응답 생성
  — ros_monitor.py L156-L195
→ GET /ros/alerts 반환
  — main.py L124-L127
→ Frontend fetchAlerts()
  — rosApi.js L38-L40
→ Topic dashboard가 공통 Alert polling
  — useTopicDashboard.js L17-L148
→ Overview와 Alerts 화면
  — OverviewPage.jsx L12-L173
  — AlertsPage.jsx L3-L60
  — AlertsList.jsx L19-L65
```

Alerts 화면은 source에 따라 관련 화면과 선택 state로 연결합니다. WebSocket도 같은
`RosMonitor.alerts()` 결과를 경량 snapshot 안에 넣습니다
(`ros_monitor.py` L117-L145).

## 5. 전체 흐름 한 문장

RosMonitor가 각 Runtime의 현재 snapshot을 도메인별 builder에 전달하고 조치 가능한
조건만 하나의 Alert 배열과 meta로 반환합니다.

## 초보자가 자주 틀리는 부분

- warning처럼 보이는 모든 badge가 Alert는 아닙니다.
- Alert는 현재 snapshot이며 영구 장애 이력이 아닙니다.
- MonitorStatus Alert의 source는 일반 Topic과 다른 `monitor_status`입니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Alert는 Runtime 상태 중 정책에 맞는 조건만 선별합니다.
2. Topic, Service, Action, Node Alert는 `/ros/alerts` 하나로 통합됩니다.
3. 현재 구현은 DB에 Alert 이력을 저장하지 않습니다.
