# 코드 추적 색인

고정 줄 번호는 코드가 바뀔 때 바로 오래된 정보가 된다. 이 문서는 파일과 함수·클래스 이름을 기준으로 시작점을 안내한다.

## Backend 시작과 조립

| 찾을 내용 | 파일 | 시작점 |
|---|---|---|
| FastAPI app와 lifespan | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` | app 생성부, lifespan, `health()` |
| singleton 생성 | `.../app_state.py` | `backend_config`, `ros_monitor` |
| 전체 시작/종료 | `.../ros_monitor.py` | `RosMonitor.start()`, `stop()` |
| ROS spin과 주기 갱신 | `.../ros_monitor.py` | `_spin()`, `_update_graph()` |
| 공통 발견 상태 | `.../resource_state.py` | `mark_graph_present()`, `disconnected_resource()` |
| 설정 로드 | `.../config_loader.py` | `load_backend_config()` |
| 등록 msg 병합 | `.../config_loader.py` | `_registered_message_types()` |

## Monitoring API

`backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py`에서 다음 endpoint를 추적한다.

- `/ros/topics`, `/ros/topics/latest`, `/ros/topics/hz`
- `/ros/services`, `/ros/actions`, `/ros/nodes`
- `/ros/alerts`
- `/ws/monitor`

실제 응답 조립은 `RosMonitor.snapshot()`, `service_snapshot()`, `action_snapshot()`, `node_snapshot()`, `alerts()`, `websocket_snapshot()`으로 이어진다.

## Topic

| 기능 | 파일/함수 |
|---|---|
| Graph와 cache | `topic/runtime.py`의 `TopicRuntime.update()` |
| 지원 타입 | `topic/filters.py`의 `is_supported_type()`, `should_deep_monitor()` |
| Subscription | `TopicRuntime._ensure_subscription()` |
| 사라진 Subscription 정리 | `TopicRuntime._cleanup_disappeared_subscriptions()` |
| callback | `TopicRuntime._latest_message_callback()` |
| latest/Hz API | `latest_message()`, `topic_hz()` |
| Hz 계산 | `topic/hz.py` |
| preview | `topic/preview.py` |
| Alert | `topic/alerts.py`의 `build_alerts()`, `retain_alerts()` |

preview builder 지원 목록은 상세 감시 가능 여부의 추가 gate가 아니다.

## Service

| 기능 | 파일/함수 |
|---|---|
| Graph와 상태 | `service/runtime.py`의 `ServiceRuntime.update()` |
| 발견 item | `service/discovery.py` |
| 상태/meta | `service/models.py` |
| active check | `service/active_check_runtime.py` |
| check 결과 변환 | `service/active_check.py` |
| Alert | `service/alerts.py` |
| 사용자 Call | `interface_lab/execution/service_call_runtime.py` |

## Action

| 기능 | 파일/함수 |
|---|---|
| Graph와 상태/관찰 | `action/runtime.py` |
| 발견 | `action/discovery.py` |
| status/feedback Subscription | `action/subscriptions.py` |
| Result 조회 | `action/result_runtime.py`, `action/result.py` |
| Alert | `action/alerts.py` |
| 사용자 Goal | `interface_lab/execution/action_goal_runtime.py` |

## Node

| 기능 | 파일/함수 |
|---|---|
| Graph 관계와 cache | `node/runtime.py` |
| 관계 수집 | `node/discovery.py` |
| 상태/meta | `node/models.py` |
| 내부 Node 제외 | `node/filters.py` |
| disconnected Alert | `node/alerts.py` |

## Alert

```text
RosMonitor.alerts()
→ topic.build_alerts()
→ service.build_service_alerts()
→ action.build_action_alerts()
→ node.build_node_alerts()
→ retain_alerts()
→ build_alert_meta()
```

유지 대상 code 집합과 history 50개 제한은 `RosMonitor.alerts()`에서 확인한다. active/resolved 전환과 60초 제거는 `topic/alerts.py`의 `retain_alerts()`가 담당한다.

## Interface Lab 관리와 Apply

| 기능 | 파일 |
|---|---|
| 경로 계산 | `interface_lab/paths.py` |
| registry | `interface_lab/management/registry.py` |
| manual/single upload metadata | `interface_lab/management/manual_interfaces.py` |
| package upload | `interface_lab/management/packages.py` |
| build/apply/import | `interface_lab/apply/runtime.py` |
| 관리 API | `routers/interface_management.py` |
| Apply API | `routers/interface_apply.py` |

## Interface Lab 실행

| 기능 | 파일 |
|---|---|
| Topic Publish/Receive | `interface_lab/execution/topic_runtime.py` |
| Service Call | `interface_lab/execution/service_call_runtime.py` |
| Action Goal | `interface_lab/execution/action_goal_runtime.py` |
| 공통 변환 | `interface_lab/common/value_converter.py` |
| Topic 실행 API | `routers/topic_execution.py` |
| Service 실행 API | `routers/service_execution.py` |
| Action 실행 API | `routers/action_execution.py` |

## Frontend

| 기능 | 파일/함수 |
|---|---|
| API 호출 | `frontend/src/api/rosApi.js` |
| page 조립 | `frontend/src/App.jsx` |
| 공통 polling | `frontend/src/hooks/usePolling.js` |
| WebSocket | `frontend/src/hooks/useMonitorWebSocket.js` |
| Topic/Service/Action/Node hooks | `frontend/src/hooks/use*Dashboard.js` |
| 주요 리소스 | `frontend/src/utils/primaryFilters.js` |
| 주요 Node | `frontend/src/utils/nodeFilters.js` |
| 상태·집계 | `frontend/src/utils/status.js` |
| Graph 변환 | `frontend/src/utils/graphTransform.js` |
| Visualization 조회 | `frontend/src/hooks/useVisualizationGraph.js` |
| Interface Topic 후보 | `frontend/src/utils/interfaceTopics.js` |

## 증상별 빠른 경로

- custom msg가 Hz 미지원: `config_loader._registered_message_types()` → `TopicRuntime._is_supported_type()` → `_ensure_subscription()`
- Topic Alert가 안 생김: `TopicRuntime.alert_snapshot()` → `topic/alerts.py`
- 해결 Alert가 집계에 남음: `retain_alerts()` → `build_alert_meta()` → Alerts/Overview
- 주요 Node 누락: `/ros/nodes` 관계 타입 → `primaryFilters.js` → `nodeFilters.js`
- Visualization 연결 누락: `participants.js` → `graphTransform.js`
- reload 후 연결 실패: lifespan → `RosMonitor.stop()/start()` → `useMonitorWebSocket()`
