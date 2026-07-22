# Backend 전체 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. 이 문서에서 설명하는 것

Backend에는 두 흐름이 함께 있다.

1. **모니터링 흐름**: ROS2 Graph API와 runtime cache로 Node/Topic/Service/Action 상태를 수집한다.
2. **Interface Lab 흐름**: 사용자가 등록한 interface로 Topic Publish/Receive, Service Call, Action Goal을 명시 실행한다.

`main.py`는 이제 endpoint 구현 파일이 아니다. FastAPI app 생성, lifespan, middleware, 공통 exception 처리, router 등록, health endpoint만 담당한다.

- Router: HTTP/WebSocket 요청을 받는 얇은 입구다. request/query/path/body를 검사하고 `RosMonitor` 또는 Interface Lab helper에 넘긴다.
- RosMonitor: Backend에서 ROS2 runtime들을 조립하고, Router가 호출할 public method를 제공하는 coordinator다.
- Runtime cache: ROS2 Graph API와 subscription/action/service 관찰 결과를 주기적으로 저장해 둔 메모리 snapshot이다.
- Interface Lab management: interface 파일, registry, package 같은 "등록 데이터"를 관리한다.
- Interface Lab apply: 등록 데이터를 실제 build/import 가능한 상태로 반영한다.
- Interface Lab execution: 사용자가 버튼을 눌렀을 때만 Topic Publish/Receive, Service Call, Action Goal을 실행한다.

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

서버가 켜질 때의 의미는 다음과 같다.

1. `main.py`가 FastAPI app 객체를 만든다.
2. app lifespan에 `RosMonitor.start()`와 `RosMonitor.stop()`을 연결한다.
3. `main.py`가 각 Router module을 등록한다. 그래서 `/ros/topics` 같은 endpoint 구현은 `main.py`가 아니라 `routers/monitoring.py`에 있다.
4. FastAPI가 요청을 받으면 등록된 Router 함수로 보낸다.
5. Router 함수는 직접 ROS2 Graph를 스캔하지 않고, `app_state.py`가 공유하는 `ros_monitor` singleton을 호출한다.

코드로 따라가면 다음 순서다.

```text
backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py
→ FastAPI app 생성
→ monitoring/interface routers 등록
→ 요청 도착
→ routers/*.py의 endpoint 함수 실행
→ ros_monitor 또는 interface_lab helper 호출
```

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

모니터링 흐름에서 중요한 점은 "조회 요청"과 "ROS2 Graph 갱신"이 분리되어 있다는 것이다.

- ROS2 Graph 갱신: `RosMonitor` 내부 timer가 주기적으로 수행한다.
- REST 조회: Frontend가 화면에 필요한 데이터를 요청하면 이미 갱신된 cache snapshot을 읽는다.
- WebSocket 조회: 1초마다 경량 snapshot을 만들어 연결된 Frontend로 보낸다.

즉 `/ros/topics`를 호출한다고 그 순간 `ros2 topic list` 같은 CLI 명령을 실행하지 않는다. Backend 구현은 ROS2 CLI subprocess 기반 모니터링이 아니라 rclpy Graph API와 runtime cache 기반이다.

예를 들어 Topic 목록 조회는 다음처럼 흐른다.

```text
Frontend Topic 화면
→ GET /ros/topics
→ routers/monitoring.py L16 endpoint decorator
→ routers/monitoring.py L17 get_ros_topics()
→ ros_monitor.py L113 snapshot()
→ TopicRuntime cache snapshot
→ JSON 응답
```

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

Interface Lab은 "등록", "적용", "실행"을 의도적으로 나누어 둔다.

- 등록: 사용자가 interface 정보를 Backend 저장소에 넣는 단계다. `interface_management.py`가 담당한다.
- 적용: 등록된 interface를 build/import 가능한 실제 ROS2 Python 타입으로 만드는 단계다. `interface_apply.py`와 `interface_lab/apply/runtime.py`가 담당한다.
- 실행: 사용자가 버튼을 눌렀을 때 Topic Publish/Receive, Service Call, Action Goal을 수행하는 단계다. `topic_execution.py`, `service_execution.py`, `action_execution.py`가 `RosMonitor`를 통해 execution runtime으로 위임한다.

초보자가 자주 헷갈리는 예시는 다음과 같다.

```text
manual-definition 저장 성공
→ 아직 새 Message 타입을 publish할 수 있다는 뜻은 아님
→ apply 실행 필요
→ build/import 성공 필요
→ callable message 목록에 나타남
→ 그때 Topic Publish/Receive에서 선택 가능
```

반대로 `manual-type`은 이미 설치되어 import 가능한 타입 이름을 registry에 적는 기능이다. 파일을 만들지 않으므로 build가 필요 없을 수 있지만, 실제 사용할 수 있는지는 import-check와 callable 목록에서 최종 확인해야 한다.

## 6. 자주 틀리는 이해

- REST 요청은 매번 ROS2 Graph를 직접 스캔하지 않고 runtime cache를 읽는다.
- WebSocket은 raw ROS2 message 스트림이 아니라 경량 monitor snapshot 채널이다.
- Interface Lab의 실행은 사용자가 버튼을 누른 경우에만 수행된다.
- `manual_type`은 파일을 만들지 않으므로 build가 필요 없고, `manual_definition`/`single_upload`/`package_upload`는 apply/build가 필요하다.
- endpoint 줄과 함수 시작 줄은 다를 수 있다. 예를 들어 `/ros/topics` endpoint decorator는 `routers/monitoring.py` L16이고, 실제 Python 함수 `get_ros_topics()`는 L17에서 시작한다.
- Router 함수 안에서 `ros_monitor.snapshot()` 같은 호출이 보이면, 그 함수가 실제 ROS2 Graph를 새로 훑는다는 뜻이 아니라 `RosMonitor`가 관리하는 runtime cache나 execution runtime으로 위임한다는 뜻이다.
- Monitoring 화면에서 보이는 `callable` 표시는 "현재 실행 후보로도 쓸 수 있음"이라는 보강 정보이고, 실제 Service Call 또는 Action Goal은 사용자가 Interface Lab에서 실행해야만 전송된다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `main.py`는 app 조립 중심이고 endpoint 구현은 `routers/`에 있다.
2. 모니터링은 `RosMonitor`와 topic/service/action/node runtime cache 흐름이다.
3. Interface Lab은 `interface_lab/management`, `apply`, `execution`, `common`으로 분리되어 명시 실행만 담당한다.
