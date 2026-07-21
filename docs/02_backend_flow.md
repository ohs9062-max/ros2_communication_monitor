# Backend 전체 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. 이 문서에서 설명하는 것

Backend에는 두 흐름이 함께 있다.

1. **모니터링 흐름**: ROS2 Graph API와 runtime cache로 Node/Topic/Service/Action 상태를 수집한다.
2. **Interface Lab 흐름**: 사용자가 등록한 interface로 Topic Publish/Receive, Service Call, Action Goal을 명시 실행한다.

`main.py`는 이제 endpoint 구현 파일이 아니다. FastAPI app 생성, lifespan, middleware, 공통 exception 처리, router 등록, health endpoint만 담당한다.

## 2. 서버 조립 흐름

```text
FastAPI app 생성
→ lifespan에서 RosMonitor start/stop 연결
→ middleware 등록
→ monitoring/interface routers 등록
→ health endpoint 제공
```

| 단계 | 코드 위치 |
|---|---|
| lifespan 정의 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L21 |
| FastAPI app 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L30 |
| router 등록 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L40-L45 |
| health endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L49 |
| RosMonitor 시작 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L74 |
| RosMonitor 종료 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L90 |

## 3. 모니터링 흐름

`RosMonitor`가 rclpy Node와 spin thread를 만들고, timer에서 `_update_graph()`를 호출한다. Topic/Service/Action/Node runtime은 Graph API로 상태를 갱신하고 REST/WebSocket은 cache snapshot만 읽는다.

| 단계 | 코드 위치 |
|---|---|
| graph update 진입 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L531 |
| Topic snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L113 |
| Service snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L117 |
| Action snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L187 |
| Node snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L332 |
| WebSocket snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L336 |
| latest message 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L368 |
| alert 통합 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L376 |

## 4. Router 구조

Router는 request/query/path/body를 받고 `RosMonitor` 또는 Interface Lab runtime/helper를 호출한다. router가 runtime 내부 dict, lock, cache를 직접 조작하지 않는다.

| Router | 대표 endpoint | 코드 위치 |
|---|---|---|
| monitoring | `/ros/topics`, `/ros/services`, `/ros/actions`, `/ros/nodes`, `/ros/alerts`, `/ws/monitor` | `routers/monitoring.py` L16-L93 |
| interface management | upload, registry, manual, package | `routers/interface_management.py` L40-L367 |
| interface apply | apply/status/import-check | `routers/interface_apply.py` L25-L85 |
| topic execution | callable message, schema, publish, receive | `routers/topic_execution.py` L14-L154 |
| service execution | callable service, service-call, history | `routers/service_execution.py` L14-L86 |
| action execution | callable action, action-goal, history | `routers/action_execution.py` L14-L94 |

## 5. Interface Lab 흐름

Interface Lab 구현은 `interface_lab/` 아래에 있다.

| 영역 | 책임 | 코드 위치 |
|---|---|---|
| management | registry, manual_type, manual_definition, single upload, package upload/delete | `interface_lab/management/` |
| apply | apply status, colcon build, import-check, reload trigger | `interface_lab/apply/runtime.py` |
| execution | Topic Publish/Receive, Service Call, Action Goal, history/cache/cleanup | `interface_lab/execution/` |
| common | schema, payload 변환, ROS message JSON-safe 변환 | `interface_lab/common/value_converter.py` |

## 6. 자주 틀리는 이해

- REST 요청은 매번 ROS2 Graph를 직접 스캔하지 않고 runtime cache를 읽는다.
- WebSocket은 raw ROS2 message 스트림이 아니라 경량 monitor snapshot 채널이다.
- Interface Lab의 실행은 사용자가 버튼을 누른 경우에만 수행된다.
- `manual_type`은 파일을 만들지 않으므로 build가 필요 없고, `manual_definition`/`single_upload`/`package_upload`는 apply/build가 필요하다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `main.py`는 app 조립 중심이고 endpoint 구현은 `routers/`에 있다.
2. 모니터링은 `RosMonitor`와 topic/service/action/node runtime cache 흐름이다.
3. Interface Lab은 `interface_lab/management`, `apply`, `execution`, `common`으로 분리되어 명시 실행만 담당한다.
