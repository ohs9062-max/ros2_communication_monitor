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

### 4.1 monitoring

`monitoring`은 ROS2 상태 조회 기능이다. 여기서 endpoint(HTTP 요청 주소)는 Frontend가 Backend에 "현재 ROS2 통신 상태를 보여 달라"고 요청하는 입구다. Monitoring Router는 ROS2 Graph를 직접 갱신하지 않는다. Graph 갱신은 `RosMonitor` timer와 Topic/Service/Action/Node runtime이 수행하고, Router는 이미 만들어진 runtime cache의 snapshot을 읽어서 반환한다.

REST endpoint는 사용자가 특정 화면을 열었을 때 필요한 상세 조회에 가깝고, WebSocket은 전체 상태를 빠르게 감지할 수 있는 경량 요약을 주기적으로 전달한다.

공통 흐름:

```text
Frontend
→ HTTP 요청 또는 WebSocket 연결
→ Monitoring Router endpoint
→ RosMonitor snapshot 함수 호출
→ runtime cache에서 현재 상태 읽기
→ 결과 반환
→ FastAPI가 JSON 응답 또는 WebSocket 메시지로 변환
→ Frontend 표시
```

#### `/ros/topics`

- 영문 기능명: topics
- 한국어 직역: 토픽 목록
- 실제 의미: 현재 ROS2 Graph에서 발견되어 cache에 저장된 Topic 목록, 타입, publisher/subscriber 수, 최신 수신 상태, Hz 같은 Topic monitoring 정보를 조회한다.
- 사용 시점: 사용자가 Dashboard의 Topic 화면에서 전체 Topic 상태를 볼 때 사용한다.
- 코드 위치: endpoint는 `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L16, 처리 함수 `get_ros_topics()`는 L17에서 시작한다.
- 호출 흐름: `get_ros_topics()` L17 → `ros_monitor.snapshot()` 호출 L19 → `RosMonitor.snapshot()`는 `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L113에서 시작 → TopicRuntime snapshot 반환 → snapshot의 `topics`, `count`, `last_updated`를 L20-L28에서 JSON으로 포장
- Frontend 반환 형태: `success`, `data`, `meta`, `message`를 포함한 JSON으로 반환되고, Frontend는 Topic 목록과 상태 값을 화면에 표시한다.

Topic 상세 화면에서 함께 쓰는 보조 endpoint도 같은 파일에 있다.

- `/ros/topics/latest`: endpoint는 `routers/monitoring.py` L31, 처리 함수 `get_latest_ros_topic()`은 L32에서 시작한다. `ros_monitor.latest_message(name)` 호출은 L34이고, `RosMonitor.latest_message()`는 `ros_monitor.py` L368에서 시작한다. 선택한 Topic의 최신 메시지 preview를 cache에서 읽는다.
- `/ros/topics/hz`: endpoint는 `routers/monitoring.py` L37, 처리 함수 `get_ros_topic_hz()`는 L38에서 시작한다. `ros_monitor.topic_hz(name)` 호출은 L40이고, `RosMonitor.topic_hz()`는 `ros_monitor.py` L372에서 시작한다. 선택한 Topic의 최근 수신 주파수를 cache에서 읽는다.

#### `/ros/services`

- 영문 기능명: services
- 한국어 직역: 서비스 목록
- 실제 의미: 현재 ROS2 Graph에서 발견된 Service의 server/client 수, 타입, active/waiting_server/inactive 같은 상태를 조회한다.
- 사용 시점: 사용자가 Service 화면에서 어떤 Service가 존재하고 서버가 준비되어 있는지 확인할 때 사용한다.
- 코드 위치: endpoint는 `routers/monitoring.py` L43, 처리 함수 `get_ros_services()`는 L44에서 시작한다.
- 호출 흐름: `get_ros_services()` L44 → `ros_monitor.service_snapshot(include_hidden=...)` 호출 L48-L50 → `RosMonitor.service_snapshot()`는 `ros_monitor.py` L117에서 시작 → ServiceRuntime cache snapshot에 ServiceCallRuntime의 callable/summary 정보를 보강한 뒤 반환
- Frontend 반환 형태: `data.services`와 `data.meta` JSON으로 반환되고, Frontend는 Service 목록과 상세 패널에 표시한다.

#### `/ros/actions`

- 영문 기능명: actions
- 한국어 직역: 액션 목록
- 실제 의미: Action 내부 service/topic을 개별 항목으로 흩어 보여주지 않고, `/CanControl` 같은 Action 단위로 묶은 상태를 조회한다.
- 사용 시점: 사용자가 Action 화면에서 Action Server/Client 존재 여부와 최근 feedback/result 관찰 상태를 볼 때 사용한다.
- 코드 위치: endpoint는 `routers/monitoring.py` L60, 처리 함수 `get_ros_actions()`는 L61에서 시작한다.
- 호출 흐름: `get_ros_actions()` L61 → `ros_monitor.action_snapshot()` 호출 L63 → `RosMonitor.action_snapshot()`는 `ros_monitor.py` L187에서 시작 → ActionRuntime cache snapshot에 ActionGoalRuntime의 callable/summary 정보를 보강한 뒤 반환
- Frontend 반환 형태: `data.actions`와 `data.meta` JSON으로 반환되고, Frontend는 Action 목록과 상태 정보를 표시한다.

#### `/ros/nodes`

- 영문 기능명: nodes
- 한국어 직역: 노드 목록
- 실제 의미: 현재 ROS2 Node와 각 Node가 연결된 Topic/Service/Action 관계를 조회한다.
- 사용 시점: 사용자가 Node 화면이나 통신 시각화 화면에서 Node 중심 연결 관계를 확인할 때 사용한다.
- 코드 위치: endpoint는 `routers/monitoring.py` L73, 처리 함수 `get_ros_nodes()`는 L74에서 시작한다.
- 호출 흐름: `get_ros_nodes()` L74 → `ros_monitor.node_snapshot()` 호출 L76 → `RosMonitor.node_snapshot()`는 `ros_monitor.py` L332에서 시작 → NodeRuntime cache snapshot 반환
- Frontend 반환 형태: `data.nodes`와 `data.meta` JSON으로 반환되고, Frontend는 Node 목록 및 Topic/Service/Action participant map 계산에 사용한다.

#### `/ros/alerts`

- 영문 기능명: alerts
- 한국어 직역: 경고 목록
- 실제 의미: Topic stale, MonitorStatus warning/error/critical, Service active_check 실패, Action terminal 상태 같은 monitoring alert를 한 목록으로 통합 조회한다.
- 사용 시점: 사용자가 Dashboard에서 현재 주의가 필요한 통신 상태를 빠르게 확인할 때 사용한다.
- 코드 위치: endpoint는 `routers/monitoring.py` L86, 처리 함수 `get_ros_alerts()`는 L87에서 시작한다.
- 호출 흐름: `get_ros_alerts()` L87 → `ros_monitor.alerts()` 호출 L89 → `RosMonitor.alerts()`는 `ros_monitor.py` L376에서 시작 → Topic/Service/Action/Node alert snapshot 통합
- Frontend 반환 형태: alert item 배열이 JSON으로 반환되고, Frontend는 level/source/name/message 기준으로 표시한다.

#### `/ws/monitor`

- 영문 기능명: monitor WebSocket
- 한국어 직역: 모니터 웹소켓
- 실제 의미: raw ROS2 message 스트림이 아니라, Dashboard가 전체 상태 변화를 가볍게 감지할 수 있도록 요약 snapshot을 주기적으로 보내는 채널이다.
- 사용 시점: 사용자가 Dashboard를 열어 둔 동안 전체 count, alert, last_updated 같은 경량 상태를 실시간에 가깝게 갱신할 때 사용한다.
- 코드 위치: endpoint는 `routers/monitoring.py` L92, 처리 함수 `monitor_websocket()`은 L93에서 시작한다.
- 호출 흐름: `monitor_websocket()` L93 → `websocket_manager.connect()` L95 → 반복문 L97 → `ros_monitor.websocket_snapshot()` 호출 L100 → `RosMonitor.websocket_snapshot()`는 `ros_monitor.py` L336에서 시작 → 1초 대기 L105 → 연결 종료 시 disconnect L106-L109
- Frontend 반환 형태: FastAPI WebSocket 메시지로 JSON snapshot이 반복 전송되고, Frontend는 REST polling을 보조하는 상태 요약으로 사용한다.

### 4.2 interface management

`interface management`는 Interface Lab에서 사용할 ROS2 interface를 등록하고 관리하는 Router다. registry(등록 정보 저장소)는 등록된 interface의 이름, 종류, source, build/import 상태를 저장하는 목록이다. 여기서 등록은 아직 apply(등록된 인터페이스의 빌드 및 실제 반영)가 아니다. 파일을 올리거나 정보를 저장해도, 실제 ROS2 Python 타입으로 쓰려면 apply/import-check 흐름이 필요할 수 있다.

공통 흐름:

```text
Frontend
→ HTTP 요청
→ Interface Management Router endpoint
→ management helper 호출
→ registry 또는 package 저장소 갱신/조회
→ 결과 반환
→ FastAPI가 JSON 응답으로 변환
→ Frontend 표시
```

#### upload

- 영문 기능명: upload
- 한국어 직역: 업로드
- 실제 의미: 사용자가 `.msg`, `.srv`, `.action` 단일 파일을 올리면 `uploaded_interfaces` package 아래에 저장하고 registry에 등록한다.
- 사용 시점: 사용자가 이미 작성된 interface 파일 하나를 Interface Lab에 추가할 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_management.py` L40, 처리 함수 `upload_ros_interface()`는 L41에서 시작한다.
- 호출 흐름: `upload_ros_interface()` L41 → 요청 크기 검사 L43-L56 → `extract_multipart_file()` 호출 L58-L60 → `register_interface()` 호출 L61 → registry 파일 존재 확인 L62-L65 → 반환 JSON 생성 L74-L85
- Frontend 반환 형태: 저장된 entry, `registry_path`, `saved_path`, status가 JSON으로 반환되고, Frontend는 등록 목록과 apply 필요 상태를 갱신한다.

#### registry

- 영문 기능명: registry
- 한국어 직역: 등록 정보 저장소
- 실제 의미: 등록된 Message/Service/Action interface 목록과 각 항목의 source, full_type, build/import 가능 여부를 관리한다.
- 사용 시점: 사용자가 Interface Lab에서 등록된 interface 목록을 보거나 특정 항목을 삭제할 때 사용한다.
- 코드 위치: 목록 endpoint는 `routers/interface_management.py` L88, 처리 함수 `get_interface_registry()`는 L89에서 시작한다. 삭제 endpoint는 L102, 처리 함수 `delete_interface_registry_entry()`는 L103에서 시작한다.
- 호출 흐름: 목록은 `get_interface_registry()` L89 → `registry_snapshot()` L92 → `interface_registry` 반환 L95-L99. 삭제는 `delete_interface_registry_entry()` L103 → 현재 registry 조회 L111-L118 → `uploaded_interfaces` 항목이면 `delete_uploaded_interface()` L124-L126 및 pending 표시 L127-L129 → 그 외 항목은 `delete_registry_entry()` L131-L136
- Frontend 반환 형태: `interface_registry.yaml` 기준의 목록이 JSON으로 반환되고, Frontend는 registry row를 표시하거나 삭제 후 목록을 다시 fetch한다.

#### manual

- 영문 기능명: manual
- 한국어 직역: 수동 등록
- 실제 의미: 사용자가 타입 이름만 직접 등록하거나, interface 정의 내용을 직접 입력해 `.msg`, `.srv`, `.action` 파일을 만든다.
- 사용 시점: 파일 업로드 없이 `std_srvs/srv/SetBool` 같은 기존 타입을 등록하거나, 브라우저에서 새 정의를 작성해 실험할 때 사용한다.
- 코드 위치: `manual-type` endpoint는 `routers/interface_management.py` L146, 처리 함수는 L147에서 시작한다. `manual-definition` 생성 endpoint는 L171, 검증 endpoint는 L197, 수정 endpoint는 L222, 삭제 endpoint는 L247에서 시작한다.
- 호출 흐름: 타입 이름만 등록할 때는 `register_manual_interface_type()` L147 → `register_manual_type()` L156-L160. 정의를 직접 쓸 때는 `write_manual_interface_definition()` L172 → `write_manual_definition()` L181-L186. 검증만 할 때는 `validate_manual_interface_definition()` L198 → `validate_manual_definition()` L207-L212. 수정/삭제는 각각 `update_manual_definition()` L232-L236, `delete_manual_definition()` L251을 호출한다.
- Frontend 반환 형태: 등록 또는 검증 결과가 JSON으로 반환되고, Frontend는 성공 메시지와 apply 필요 여부를 표시한다.

#### package

- 영문 기능명: package
- 한국어 직역: 패키지
- 실제 의미: 완성된 ROS2 interface package를 zip 또는 폴더 단위로 `uploaded_interface_packages` 아래에 보존하고 package registry에 등록한다.
- 사용 시점: 여러 interface와 package.xml/CMakeLists.txt가 함께 있는 기존 ROS2 interface package를 통째로 추가할 때 사용한다.
- 코드 위치: zip 업로드 endpoint는 `routers/interface_management.py` L276, 폴더 업로드 endpoint는 L314, 목록 endpoint는 L350, 삭제 endpoint는 L367에서 시작한다.
- 호출 흐름: zip은 `upload_ros_interface_package()` L277 → `extract_multipart_file()` L297-L299 → `upload_interface_package()` L300. 폴더는 `upload_ros_interface_package_folder()` L315 → `extract_multipart_package_files()` L335-L337 → `upload_interface_package_folder()` L338. 목록은 `packages_snapshot()` L354, 삭제는 `delete_interface_package()` L371을 호출한다.
- Frontend 반환 형태: package entry와 package 목록이 JSON으로 반환되고, Frontend는 package row와 apply 필요 상태를 표시한다.

### 4.3 interface apply

`interface apply`는 등록된 interface를 실제 ROS2와 Backend에서 사용할 수 있도록 반영하는 단계다. apply(등록된 인터페이스의 빌드 및 실제 반영)는 단순 등록이 아니라 파일 생성 상태 확인, CMake 등록, package 의존성 반영, `colcon build`, import-check(Python 또는 ROS2 환경에서 타입을 불러올 수 있는지 확인)를 포함한다. 성공 후에는 Backend reload가 예약될 수 있다.

공통 흐름:

```text
Frontend
→ HTTP 요청
→ Interface Apply Router endpoint
→ apply runtime 호출
→ build/import 상태 계산
→ 결과 반환
→ FastAPI가 JSON 응답으로 변환
→ Frontend 표시
```

#### apply

- 영문 기능명: apply
- 한국어 직역: 적용
- 실제 의미: registry와 package 저장소에 등록된 interface를 실제 ROS2 workspace build 결과로 반영한다.
- 사용 시점: 사용자가 새 interface를 등록, 수정, 삭제한 뒤 실제 Topic Publish/Receive, Service Call, Action Goal에 사용 가능하게 만들 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_apply.py` L25, 처리 함수 `apply_ros_interfaces()`는 L26에서 시작한다.
- 호출 흐름: `apply_ros_interfaces()` L26 → `run_interface_apply()` 호출 L29 → build/import 결과 확인 L35 → 성공이면 `touch_reload_trigger_after_delay()` background task 예약 L36 → 성공 JSON L37-L47 또는 실패 JSON L58-L68 반환
- Frontend 반환 형태: `success`, `status`, `build_status`, `real_apply_success`, `reload_scheduled`, `summary`, `not_applied`가 JSON으로 반환되고, Frontend는 적용 성공/실패와 재시도 필요 항목을 표시한다.

#### status

- 영문 기능명: status
- 한국어 직역: 상태
- 실제 의미: 마지막 apply의 진행 상태, build 결과, pending 여부, 실패 사유를 조회한다.
- 사용 시점: 사용자가 Interface Lab에서 현재 등록 변경이 빌드에 반영되었는지 확인할 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_apply.py` L71, 처리 함수 `get_interface_apply_status()`는 L72에서 시작한다.
- 호출 흐름: `get_interface_apply_status()` L72 → `apply_status()` 호출 L75 → `interface_apply_status.yaml` 기반 상태 반환 L78-L82
- Frontend 반환 형태: apply status JSON이 반환되고, Frontend는 적용 버튼 상태와 안내 메시지에 사용한다.

#### import-check

- 영문 기능명: import-check
- 한국어 직역: 가져오기 확인
- 실제 의미: 빌드된 Message/Service/Action 타입을 현재 Backend Python 환경에서 실제 import할 수 있는지 다시 검사한다.
- 사용 시점: build 후에도 새 타입이 실행 후보에 안 보이거나, registry의 import 가능 상태를 재확인해야 할 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_apply.py` L85, 처리 함수 `check_ros_interface_imports()`는 L86에서 시작한다.
- 호출 흐름: `check_ros_interface_imports()` L86 → `run_import_check_and_update_registry()` L89 → `record_import_check_status()` L90 → `refresh_registry_imports()` L91 → summary와 갱신 registry 반환 L95-L105
- Frontend 반환 형태: 갱신된 registry, summary, `install_python_paths`, `not_applied`가 JSON으로 반환되고, Frontend는 import 가능/불가능 상태를 registry 목록에 반영한다.

### 4.4 topic execution

`topic execution`은 사용자가 Interface Lab에서 Topic 작업을 명시적으로 실행하는 Router다. Monitoring Topic은 자동으로 ROS2 Topic 상태를 관찰하지만, Topic Execution은 사용자가 직접 publish(Topic 메시지 발행) 또는 receive(Topic 메시지 수신)를 실행한다.

공통 흐름:

```text
Frontend
→ HTTP 요청
→ Topic Execution Router endpoint
→ RosMonitor의 Topic execution 위임 함수 호출
→ InterfaceReceiveRuntime 또는 TopicPublishRuntime 처리
→ 결과 반환
→ FastAPI가 JSON 응답으로 변환
→ Frontend 표시
```

#### callable message

- 영문 기능명: callable message
- 한국어 직역: 호출 가능한 메시지
- 실제 의미: callable(현재 실제 사용할 수 있는 상태)인 Message 타입 목록이다. Topic Publish 또는 Receive 작업에 사용할 수 있도록 registry에 등록되어 있고 현재 Backend에서 import 가능한 ROS2 Message 타입을 뜻한다.
- 사용 시점: 사용자가 Interface Lab에서 Topic 타입을 선택할 때 사용한다.
- 코드 위치: endpoint는 `routers/topic_execution.py` L14, 처리 함수 `get_callable_messages()`는 L15에서 시작한다.
- 호출 흐름: `get_callable_messages()` L15 → `ros_monitor.callable_messages()` 호출 L17 → `RosMonitor.callable_messages()`는 `ros_monitor.py` L294에서 시작 → InterfaceReceiveRuntime의 callable message 목록 반환
- Frontend 반환 형태: `data`에는 Message 목록, `meta`에는 count 같은 요약이 들어가며, Frontend는 타입 선택 옵션으로 표시한다.

#### schema

- 영문 기능명: schema
- 한국어 직역: 데이터 필드 구조
- 실제 의미: schema(데이터 필드 구조)는 선택한 Message 타입이 어떤 필드와 nested 구조를 가지는지 나타낸다.
- 사용 시점: 사용자가 Topic Publish payload를 입력하거나 Receive 결과 구조를 이해해야 할 때 사용한다.
- 코드 위치: endpoint는 `routers/topic_execution.py` L26, 처리 함수 `get_message_schema()`는 L27에서 시작한다.
- 호출 흐름: `get_message_schema()` L27 → query parameter `full_type` 수신 → `ros_monitor.message_schema(message_type=full_type)` 호출 L30 → `RosMonitor.message_schema()`는 `ros_monitor.py` L298에서 시작 → value converter 기반 schema 생성
- Frontend 반환 형태: Message 필드 구조 JSON이 반환되고, Frontend는 동적 입력 form을 만든다.

#### publish

- 영문 기능명: publish
- 한국어 직역: 발행
- 실제 의미: 사용자가 입력한 Topic 이름, Message 타입, payload로 ROS2 Topic 메시지를 한 번 발행한다.
- 사용 시점: 사용자가 Interface Lab에서 테스트용 명령이나 데이터 메시지를 직접 보낼 때 사용한다.
- 코드 위치: endpoint는 `routers/topic_execution.py` L40, 처리 함수 `publish_registered_topic()`은 L41에서 시작한다.
- 호출 흐름: `publish_registered_topic()` L41 → JSON body 읽기 L43-L48 → `topic_name`, `topic_type`, `message` 검증 L50-L58 → `ros_monitor.publish_topic(...)` 호출 L61-L65 → `RosMonitor.publish_topic()`은 `ros_monitor.py` L302에서 시작 → payload validation → ROS message 생성 및 publish
- Frontend 반환 형태: 성공/실패, validation error 여부, 발행 이력이 JSON으로 반환되고, Frontend는 실행 결과와 history에 표시한다.

#### receive

- 영문 기능명: receive
- 한국어 직역: 수신
- 실제 의미: 사용자가 지정한 Topic에 대해 명시적으로 구독을 시작/중지하고 수신 history를 조회한다.
- 사용 시점: 자동 monitoring 대상이 아닌 Topic까지 사용자가 직접 payload를 확인하고 싶을 때 사용한다.
- 코드 위치: start endpoint는 `routers/topic_execution.py` L99, stop endpoint는 L117, 수신 상태 목록 endpoint는 L131, history endpoint는 L138, reset endpoint는 L154에서 시작한다.
- 호출 흐름: start는 `start_receive_topic()` L100 → `ros_monitor.start_receive_topic()` L107-L111 → `RosMonitor.start_receive_topic()`는 `ros_monitor.py` L252에서 시작. stop은 `stop_receive_topic()` L118 → `RosMonitor.stop_receive_topic()` L260. 목록/history/reset은 각각 `RosMonitor.receive_topics()` L264, `receive_topic_history()` L268, `reset_receive_topic_history()` L282로 위임된다.
- Frontend 반환 형태: 수신 중인 Topic 상태와 수신 메시지 history가 JSON으로 반환되고, Frontend는 Receive 패널과 history 목록에 표시한다.

### 4.5 service execution

`service execution`은 사용자가 실제 ROS2 Service Request를 보내는 명시 실행 Router다. Monitoring Service는 Service의 존재와 상태를 관찰하고, Execution은 사용자가 실제 요청을 전송한다. service-call(Service Request 전송 및 Response 수신)은 장비 동작을 바꿀 수 있으므로 사용자 실행 없이 자동 호출하지 않는다.

공통 흐름:

```text
Frontend
→ HTTP 요청
→ Service Execution Router endpoint
→ RosMonitor의 Service execution 위임 함수 호출
→ ServiceCallRuntime 처리
→ 결과 반환
→ FastAPI가 JSON 응답으로 변환
→ Frontend 표시
```

#### callable service

- 영문 기능명: callable service
- 한국어 직역: 호출 가능한 서비스
- 실제 의미: registry에 등록되어 import 가능하고, 현재 ROS2 Graph에서 exact service_name/full_type match가 있으며 server_count가 1 이상인 Service 대상 목록이다.
- 사용 시점: 사용자가 Interface Lab에서 호출할 Service를 선택할 때 사용한다.
- 코드 위치: endpoint는 `routers/service_execution.py` L14, 처리 함수 `get_callable_services()`는 L15에서 시작한다.
- 호출 흐름: `get_callable_services()` L15 → `ros_monitor.callable_services()` 호출 L17 → `RosMonitor.callable_services()`는 `ros_monitor.py` L147에서 시작 → ServiceCallRuntime이 registry/import/graph 상태를 대조
- Frontend 반환 형태: `data`에는 호출 가능한 Service 목록, `meta`에는 요약이 들어가며, Frontend는 Service 선택 옵션으로 표시한다.

#### service-call

- 영문 기능명: service-call
- 한국어 직역: 서비스 호출
- 실제 의미: 사용자가 입력한 request 값을 ROS2 Service Server로 보내고 response를 기다린다.
- 사용 시점: 사용자가 Interface Lab에서 특정 Service를 테스트하거나 장비/시스템 기능을 명시적으로 실행할 때 사용한다.
- 코드 위치: endpoint는 `routers/service_execution.py` L26, 처리 함수 `call_registered_service()`는 L27에서 시작한다.
- 호출 흐름: `call_registered_service()` L27 → JSON body 읽기 L29-L35 → `service_name`, `service_type`, `request` 검증 L37-L45 → `ros_monitor.call_service(...)` 호출 L48-L53 → `RosMonitor.call_service()`는 `ros_monitor.py` L151에서 시작 → payload validation → Service Request 전송 및 Response 수신
- Frontend 반환 형태: `sent_to_server`, response, error, timeout 여부가 JSON으로 반환되고, Frontend는 실행 결과와 실패 사유를 표시한다.

#### history

- 영문 기능명: history
- 한국어 직역: 이력
- 실제 의미: Service Call의 요청, 응답, 성공, 실패, timeout 등의 실행 기록이다.
- 사용 시점: 사용자가 이전 Service 실행 결과를 다시 확인하거나, 실패 원인을 비교할 때 사용한다.
- 코드 위치: service-call history endpoint는 `routers/service_execution.py` L67, receive-shaped history endpoint는 L79, reset endpoint는 L86에서 시작한다.
- 호출 흐름: `get_service_call_history()` L68 → `ros_monitor.service_call_history()` L70 → `RosMonitor.service_call_history()`는 `ros_monitor.py` L167에서 시작. receive-shaped history는 `receive_service_history()` L80 → `RosMonitor.receive_service_history()` L171, reset은 `reset_receive_service_history()` L87 → `RosMonitor.reset_receive_service_history()` L175로 위임된다.
- Frontend 반환 형태: call history 배열과 meta가 JSON으로 반환되고, Frontend는 Service history 목록에 표시한다.

### 4.6 action execution

`action execution`은 사용자가 실제 ROS2 Action Server로 Goal을 보내는 명시 실행 Router다. Monitoring Action은 Action Server와 관련 통신 상태를 관찰하고, Execution은 사용자가 실제 Goal을 전송하고 Feedback과 Result를 확인한다. action-goal(Action Server로 Goal 전송)도 장비 동작을 바꿀 수 있으므로 사용자 실행 없이 자동 전송하지 않는다.

공통 흐름:

```text
Frontend
→ HTTP 요청
→ Action Execution Router endpoint
→ RosMonitor의 Action execution 위임 함수 호출
→ ActionGoalRuntime 처리
→ 결과 반환
→ FastAPI가 JSON 응답으로 변환
→ Frontend 표시
```

#### callable action

- 영문 기능명: callable action
- 한국어 직역: 실행 가능한 액션
- 실제 의미: registry에 등록되어 import 가능하고, 현재 ROS2 Graph에서 exact action_name/full_type match가 있으며 Action Server가 준비된 Action 목록이다.
- 사용 시점: 사용자가 Interface Lab에서 Goal을 보낼 Action을 선택할 때 사용한다.
- 코드 위치: endpoint는 `routers/action_execution.py` L14, 처리 함수 `get_callable_actions()`는 L15에서 시작한다.
- 호출 흐름: `get_callable_actions()` L15 → `ros_monitor.callable_actions()` 호출 L17 → `RosMonitor.callable_actions()`는 `ros_monitor.py` L212에서 시작 → ActionGoalRuntime이 registry/import/graph 상태를 대조
- Frontend 반환 형태: `data`에는 실행 가능한 Action 목록, `meta`에는 요약이 들어가며, Frontend는 Action 선택 옵션으로 표시한다.

#### action-goal

- 영문 기능명: action-goal
- 한국어 직역: 액션 목표
- 실제 의미: 사용자가 입력한 goal 데이터를 ROS2 Action Server로 전송하고 accepted/rejected, feedback, result를 기다린다.
- 사용 시점: 사용자가 Interface Lab에서 특정 Action을 테스트하거나 작업 목표를 명시적으로 실행할 때 사용한다.
- 코드 위치: endpoint는 `routers/action_execution.py` L26, 처리 함수 `send_registered_action_goal()`는 L27에서 시작한다.
- 호출 흐름: `send_registered_action_goal()` L27 → JSON body 읽기 L29-L35 → `action_name`, `action_type/full_type`, `goal` 검증 L37-L53 → `ros_monitor.send_action_goal(...)` 호출 L56-L61 → `RosMonitor.send_action_goal()`은 `ros_monitor.py` L216에서 시작 → payload validation → Action Goal 전송 → Feedback/Result 수집
- Frontend 반환 형태: accepted/rejected, feedback, result, result_error, timeout 여부가 JSON으로 반환되고, Frontend는 실행 결과와 진행 기록을 표시한다.

#### history

- 영문 기능명: history
- 한국어 직역: 이력
- 실제 의미: Action Goal, Feedback, Result, Cancel, 성공, 실패 기록이다. 현재 구현에서는 사용자가 명시 실행한 Goal의 feedback/result receive-shaped history도 함께 조회할 수 있다.
- 사용 시점: 사용자가 이전 Action 실행의 진행 과정과 최종 결과를 다시 확인할 때 사용한다.
- 코드 위치: action-goal history endpoint는 `routers/action_execution.py` L75, receive-shaped history endpoint는 L87, reset endpoint는 L94에서 시작한다.
- 호출 흐름: `get_action_goal_history()` L76 → `ros_monitor.action_goal_history()` L78 → `RosMonitor.action_goal_history()`는 `ros_monitor.py` L232에서 시작. receive-shaped history는 `get_receive_action_history()` L88 → `RosMonitor.receive_action_history()` L236, reset은 `reset_receive_action_history()` L95 → `RosMonitor.reset_receive_action_history()` L240으로 위임된다.
- Frontend 반환 형태: goal history 또는 feedback/result history 배열과 meta가 JSON으로 반환되고, Frontend는 Action history 목록에 표시한다.

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
