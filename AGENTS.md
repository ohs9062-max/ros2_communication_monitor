# AGENTS Codex Lite

이 파일은 Codex가 `ros2_dashboard`에서 작업할 때 따라야 하는 현재 기준 문서다.
구현 정책이 바뀌거나 주요 기능이 추가되면 사용자 요청에 따라 이 문서를 최신 상태로 갱신한다.

## 1. 목적

Codex는 이 프로젝트에서 아래 원칙을 우선한다.

```text
불필요한 구조 변경 방지
기존 API 경로와 응답 key 유지
ROS2 / FastAPI / React / Electron 역할 분리
ROS2 CLI subprocess 기반 모니터링 금지
ROS2 Graph API 기반 자동 발견
하드코딩된 로봇 Topic / Service / Action 이름 의존 금지
사용자 명시 실행과 자동 모니터링 경로 분리
생성물 폴더 직접 수정 금지
```

사용자용 긴 설명은 `README.md`와 `docs/`에 둔다.
Codex 작업 제한, 금지사항, 설계 원칙은 이 파일 기준으로 판단한다.

## 2. 프로젝트 정의

`ros2_dashboard`는 ROS2에서 실행 중인 Node, Topic, Service, Action의 통신 상태를 수집하고,
FastAPI backend와 Electron + React dashboard에서 확인하는 ROS2 Communication Monitor Dashboard다.

목표는 단순 목록 표시가 아니라 ROS2 시스템 디버깅, 운영 상태 확인, 등록된 interface 기반 테스트 실행이다.

## 3. 기술 스택

```text
OS: Ubuntu 24.04
ROS2: Jazzy
ROS2 수집: Python / rclpy
Backend API: FastAPI
Frontend UI: React
Desktop App: Electron
Dev server: Vite
테스트 환경: TurtleBot3 + Gazebo 또는 실제 ROS2 장비
```

Node.js는 Vite 요구사항 때문에 Node 20 이상을 기준으로 한다.

## 4. 프로젝트 구조 기준

```text
ros2_dashboard/
├─ AGENTS.md
├─ README.md
├─ docs/
├─ backend/
│  ├─ .env
│  ├─ config/
│  │  ├─ monitor.yaml
│  │  ├─ interface_registry.yaml
│  │  ├─ interface_packages.yaml
│  │  └─ interface_apply_status.yaml
│  ├─ build/              # 생성물, 직접 수정 금지
│  ├─ install/            # 생성물, 직접 수정 금지
│  ├─ log/                # 생성물, 직접 수정 금지
│  └─ src/
│     ├─ ros2_dashboard_backend/
│     │  └─ ros2_dashboard_backend/
│     │     ├─ main.py
│     │     ├─ app_state.py
│     │     ├─ ros_monitor.py
│     │     ├─ routers/
│     │     │  ├─ monitoring.py
│     │     │  ├─ interface_management.py
│     │     │  ├─ interface_apply.py
│     │     │  ├─ topic_execution.py
│     │     │  ├─ service_execution.py
│     │     │  └─ action_execution.py
│     │     ├─ interface_lab/
│     │     │  ├─ paths.py
│     │     │  ├─ management/
│     │     │  │  ├─ registry.py
│     │     │  │  ├─ manual_interfaces.py
│     │     │  │  └─ packages.py
│     │     │  ├─ apply/
│     │     │  │  └─ runtime.py
│     │     │  ├─ execution/
│     │     │  │  ├─ topic_runtime.py
│     │     │  │  ├─ service_call_runtime.py
│     │     │  │  └─ action_goal_runtime.py
│     │     │  └─ common/
│     │     │     └─ value_converter.py
│     │     ├─ topic/
│     │     ├─ service/
│     │     ├─ action/
│     │     └─ node/
│     ├─ ros2_dashboard_interfaces/
│     ├─ uploaded_interfaces/
│     └─ uploaded_interface_packages/
└─ frontend/
   ├─ package.json
   ├─ index.html
   └─ src/
      ├─ App.jsx
      ├─ api/rosApi.js
      └─ pages/InterfaceLabPage.jsx
```

역할 기준:

```text
backend/
= ROS2 workspace 역할. colcon build는 항상 여기서 실행한다.

backend/src/ros2_dashboard_backend/
= ROS2 ament_python backend 패키지

ros_monitor.py
= RosMonitor coordinator. rclpy Node 생성, spin thread, runtime 조립,
  Alert 통합과 public API용 snapshot 제공. Interface Lab 실행 runtime도 생성하고
  public method 호환을 위해 위임하지만, registry/build/file 관리 세부 구현을 직접 하지 않는다.

app_state.py
= FastAPI router가 공유하는 backend_config / ros_monitor singleton 생성 위치

main.py
= FastAPI app 생성, lifespan, middleware, exception 처리, router 등록, health endpoint만 담당한다.

routers/
= FastAPI endpoint 계층. request/query/path/body 파싱, RosMonitor 또는 Interface Lab runtime 호출,
  HTTP response 반환만 담당한다. registry/build/rclpy 실행 로직을 router에 넣지 않는다.

topic/
= Topic discovery / filter / subscription / preview / hz / alert 로직

service/
= Service graph 조회 / filter / status / alert / allowlist active_check 로직
  명시적 Service Call 실행 runtime은 interface_lab/execution/service_call_runtime.py에 둔다.

action/
= Action graph 조회 / status-feedback topic 관찰 / result 관찰 / alert 로직
  명시적 Action Goal 실행 runtime은 interface_lab/execution/action_goal_runtime.py에 둔다.

node/
= Node graph 조회 / pub-sub-service-action 관계 조립 / stale 감지 / alert 로직

interface_lab/management/registry.py
= single_upload 등록, registry snapshot, registry entry 삭제 보조

interface_lab/management/manual_interfaces.py
= manual_type, manual_definition, uploaded_interfaces 파일 삭제,
  CMakeLists.txt/package.xml 전체 재생성 함수 관리

interface_lab/management/packages.py
= package_upload zip/folder 저장, package registry, package 삭제 관리

interface_lab/apply/runtime.py
= build/apply/import 상태와 pending 상태 관리

interface_lab/execution/topic_runtime.py
= Interface Lab의 사용자 명시 Topic Receive start/stop/history 관리
  및 Topic Publish 실행 runtime

interface_lab/common/value_converter.py
= Interface Lab Topic Publish, Service Call, Action Goal에서 공유하는 schema 생성,
  payload validation, ROS generated object 생성, JSON-safe 변환 helper

frontend/
= Vite React + Electron UI. Dashboard와 Interface Lab 화면을 제공한다.
```

`backend/build/`, `backend/install/`, `backend/log/`, `frontend/node_modules/`는 생성물이다.
직접 수정하지 않는다.

빌드는 항상 `backend/`에서 실행한다.
루트에 `build/`, `install/`, `log/`가 생기면 잘못된 위치에서 빌드한 것이다.

## 5. 시스템 흐름

```text
TurtleBot3 + Gazebo 또는 실제 ROS2 장비
        ↓
ROS2 Nodes / Topics / Services / Actions
        ↓
Python rclpy Monitor Node
        ↓
FastAPI Backend
        ↓
REST API + 경량 WebSocket
        ↓
React UI
        ↓
Electron Desktop App
```

React/Electron은 ROS2에 직접 접근하지 않는다.

```text
React / Electron → FastAPI → Python rclpy → ROS2
```

## 6. 현재 구현된 API

기존 API 경로와 JSON key를 제거하지 않는다.

```text
GET    /health
GET    /ros/topics
GET    /ros/topics/latest?name=...
GET    /ros/topics/hz?name=...
GET    /ros/services
GET    /ros/actions
GET    /ros/nodes
GET    /ros/alerts

POST   /ros/interfaces/upload
GET    /ros/interfaces/registry
DELETE /ros/interfaces/registry/{kind}/{file_name}
POST   /ros/interfaces/manual-type
POST   /ros/interfaces/manual-definition
POST   /ros/interfaces/manual-definition/validate
PUT    /ros/interfaces/manual-definition/{kind}/{type_name}
DELETE /ros/interfaces/manual-definition/{kind}/{type_name}
POST   /ros/interfaces/uploaded-interfaces/rebuild-cmake

POST   /ros/interfaces/packages/upload
POST   /ros/interfaces/packages/folder-upload
GET    /ros/interfaces/packages
DELETE /ros/interfaces/packages/{package_name}

POST   /ros/interfaces/apply
GET    /ros/interfaces/apply/status
POST   /ros/interfaces/import-check

GET    /ros/interfaces/callable-services
POST   /ros/interfaces/service-call
GET    /ros/interfaces/service-call/history

GET    /ros/interfaces/callable-actions
POST   /ros/interfaces/action-goal
GET    /ros/interfaces/action-goal/history

GET    /ros/interfaces/callable-messages
GET    /ros/interfaces/message-schema
POST   /ros/interfaces/topic-publish
GET    /ros/interfaces/topic-publish/history
POST   /ros/interfaces/topic-publish/history/reset

POST   /ros/interfaces/receive/topics/start
POST   /ros/interfaces/receive/topics/stop
GET    /ros/interfaces/receive/topics
GET    /ros/interfaces/receive/topics/history
POST   /ros/interfaces/receive/topics/history/reset
GET    /ros/interfaces/receive/services/history
POST   /ros/interfaces/receive/services/history/reset
GET    /ros/interfaces/receive/actions/history
POST   /ros/interfaces/receive/actions/history/reset

WS     /ws/monitor
```

주요 endpoint는 `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/`에 기능별로 둔다.
`main.py`는 app 조립, lifespan, middleware, router 등록, health endpoint만 담당한다.
frontend API 함수는 `frontend/src/api/rosApi.js`에 둔다.

## 7. Configuration Policy

`.env`와 `backend/config/monitor.yaml`의 책임을 분리한다.

`.env`:

```text
API_HOST
API_PORT
CORS_ORIGINS
MONITOR_CONFIG_PATH
```

`monitor.yaml`:

```text
poll_interval_sec
stale_timeout_sec
hz_window_sec
topic/service/action include / exclude
topic auto_discover
supported_types
auto_subscribe_supported_types
service active_check allowlist
```

원칙:

```text
.env에 ROS2 감시 대상 목록을 넣지 않는다.
frontend에 ROS2 감시 대상 목록을 넣지 않는다.
설정 파일이 없어도 safe default로 서버가 죽지 않아야 한다.
Gazebo/TurtleBot3 topic 이름을 Python 코드에 하드코딩하지 않는다.
```

## 8. ROS2 Graph API 정책

ROS2 목록 조회 모니터링을 CLI subprocess 파싱으로 만들지 않는다.

금지:

```python
subprocess.run(["ros2", "topic", "list"])
subprocess.run(["ros2", "node", "list"])
subprocess.run(["ros2", "service", "list"])
subprocess.run(["ros2", "action", "list"])
```

사용:

```python
node.get_node_names()
node.get_topic_names_and_types()
node.get_service_names_and_types()
node.count_publishers(topic_name)
node.count_subscribers(topic_name)
node.count_services(service_name)
node.count_clients(service_name)
rclpy.action.graph.get_action_names_and_types(node)
rclpy.action.graph.get_action_server_names_and_types_by_node(...)
rclpy.action.graph.get_action_client_names_and_types_by_node(...)
```

`ros2` CLI는 개발자가 수동 검증 명령으로 실행할 수는 있지만,
backend 기능 구현의 데이터 소스로 사용하지 않는다.

## 9. Topic 정책

대시보드는 특정 토픽 이름에 의존하면 안 된다.

예시 토픽 이름:

```text
/scan
/odom
/cmd_vel
/imu
/joint_states
```

위 이름은 테스트나 문서 예시에는 사용할 수 있지만, 대시보드 동작의 필수 조건이면 안 된다.

기본 흐름:

```text
1. ROS2 graph에서 topic 목록 조회
2. topic name과 message type 확인
3. include / exclude 적용
4. supported type이면 자동 subscription 생성
5. 기존 subscription이 있으면 재사용
6. latest / hz / stale / alerts cache 계산
```

깊은 모니터링은 topic name보다 message type 기준으로 처리한다.

지원 타입 예:

```text
sensor_msgs/msg/LaserScan
nav_msgs/msg/Odometry
sensor_msgs/msg/Imu
geometry_msgs/msg/Twist
geometry_msgs/msg/TwistStamped
sensor_msgs/msg/JointState
ros2_dashboard_interfaces/msg/MonitorStatus
```

Interface Lab의 Topic Receive는 일반 TopicRuntime 자동 deep monitoring과 다르다.
사용자가 명시적으로 수신 시작/중지를 누른 Topic만
`interface_lab/execution/topic_runtime.py`의 `InterfaceReceiveRuntime`이 구독하고 history를 관리한다.

Interface Lab Topic Publish 후보 정책:

```text
기존 Graph Topic 후보는 현재 선택 Message full_type과 Graph type이 exact match인 Topic만 표시한다.
이 후보는 기존 Topic에 추가 Publisher로 참여할 채널을 선택하는 용도다.
이름에 /_action/이 포함되거나 /_action으로 끝나는 Action 내부 Topic은
일반 Message Publish 자동 후보에서 제외하되 Monitoring/Action 관찰 목록에서는 제거하지 않는다.
Graph 후보가 정확히 1개이고 Publish Topic name이 비어 있을 때만 자동 입력할 수 있다.
후보가 0개이면 공란을 유지하고, 2개 이상이면 사용자가 직접 선택한다.
Graph 후보 선택 시 Topic 이름을 입력란에 복사하되 입력란은 계속 직접 편집 가능해야 한다.
사용자가 직접 입력한 정상 Topic 이름은 polling, Graph 재조회, 렌더링으로 덮어쓰지 않는다.
Graph에 없는 유효한 새 Topic 이름은 사용자의 명시적 Publish로 Publisher 생성을 허용한다.
```

Interface Lab Topic Publish type 안전 정책:

```text
Action 내부 Topic 이름은 Graph 존재/type 여부와 관계없이 일반 Message Publish에서 거부한다.
같은 Topic 이름에 요청 full_type과 다른 Message type이 Graph에 하나라도 있으면
interface_lab/execution/topic_runtime.py의 publish_topic()이 Publisher 생성 전에 거부한다.
실제 publish를 수행하지 않고 success=false, published=false, sent_to_topic=false,
error_type=action_internal_topic 또는 topic_type_conflict와 graph_state를
기존 Publish history 형식으로 기록한다.
Frontend 경고는 사용자 안내용이며 Backend Graph 검증을 대체하지 않는다.
```

## 10. Service 정책

Service는 Topic처럼 지속 메시지를 흘리지 않는다.

Service에는 세 경로가 있다.

```text
ServiceRuntime
= Graph 상태, server/client count, category/status/reason, alert snapshot

ServiceActiveCheckRuntime
= monitor.yaml allowlist에 등록된 안전한 Service만 background active_check

ServiceCallRuntime (interface_lab/execution/service_call_runtime.py)
= Interface Lab에서 사용자가 실행 버튼을 누른 경우에만 명시적 Service request 전송
```

Service 상태 기준:

```text
server_count > 0
→ active

server_count == 0 and client_count > 0
→ waiting_server

server_count == 0 and client_count == 0
→ inactive

type 없음 또는 비정상
→ unknown
```

기본 제외 대상:

```text
*/describe_parameters
*/get_parameter_types
*/get_parameters
*/list_parameters
*/set_parameters
*/set_parameters_atomically
action_internal service
ros_internal service
hidden management service
```

명시적 Service Call 정책:

```text
사용자가 UI에서 실행 버튼을 누른 경우에만 호출한다.
호출 후보는 import 가능한 등록 .srv와 현재 ROS2 graph의 exact service_name/full_type match다.
server_count >= 1이어야 callable이다.
request schema는 parsed.request 또는 get_fields_and_field_types() 기반이다.
interface_lab/common/value_converter.py가 scalar, sequence, nested custom msg,
custom msg array를 재귀 변환한다.
validation 실패 시 sent_to_server=false로 기록하고 ROS server에 보내지 않는다.
timeout, response, history를 저장한다.
Graph에 보이는 모든 Service를 자동 호출하거나 숨은 Service를 임의 호출하지 않는다.
```

장비 제어 가능성이 있는 Service는 사용자의 명시 실행 없이 호출하지 않는다.

## 11. Action 정책

Action은 내부적으로 service와 topic을 사용하지만, dashboard API는 Action 단위로 묶어서 표시한다.

예:

```text
/CanControl
/CanControl/_action/send_goal
/CanControl/_action/get_result
/CanControl/_action/cancel_goal
/CanControl/_action/feedback
/CanControl/_action/status
```

`/ros/actions`는 `/CanControl` 하나로 표시한다.
Service 화면에서는 action_internal service를 기본 숨김 처리한다.

Action에는 두 경로가 있다.

```text
ActionRuntime + ActionResultRuntime
= Graph/status/feedback/result 관찰 경로.
  새 Goal을 만들지 않고, status topic에서 관찰된 terminal goal_id에 대해서만 get_result를 시도한다.

ActionGoalRuntime (interface_lab/execution/action_goal_runtime.py)
= Interface Lab에서 사용자가 실행 버튼을 누른 경우에만 명시적 Action Goal 전송.
```

Action 상태 기준:

```text
server_count > 0
→ active

server_count == 0 and client_count > 0
→ waiting_server

server_count == 0 and client_count == 0
→ inactive

type 없음 또는 비정상
→ unknown
```

관찰 대상:

```text
status topic: <action_name>/_action/status
feedback topic: <action_name>/_action/feedback
```

`action_msgs/msg/GoalStatusArray` status code 매핑:

```text
0 unknown
1 accepted
2 executing
3 canceling
4 succeeded
5 canceled
6 aborted
```

명시적 Action Goal 정책:

```text
사용자가 UI에서 실행 버튼을 누른 경우에만 Goal을 보낸다.
호출 후보는 import 가능한 등록 .action과 현재 ROS2 graph의 exact action_name/full_type match다.
server_count >= 1이어야 callable이다.
같은 action_name이라도 full_type이 다르면 다른 Action으로 취급한다.
ActionClient cache key는 (action_name, action_type) 쌍이다.
goal schema는 parsed.goal 또는 get_fields_and_field_types() 기반이다.
goal 변환은 interface_lab/common/value_converter.py의 recursive converter 원칙을 따른다.
validation 실패 시 sent_to_server=false로 기록하고 ROS server에 보내지 않는다.
accepted/rejected, timeout, feedback, result, result_error, history를 저장한다.
Graph에 보이는 모든 Action을 자동 실행하거나 반복 실행하지 않는다.
```

금지:

```text
사용자 승인 없는 Action Goal 전송
Action cancel 전송 기능 임의 추가
관찰하지 않은 goal_id에 대한 Action get_result 직접 호출
Action active_check 구현
장비가 움직일 수 있는 action 임의 실행
```

## 12. Interface Lab 정책

Interface Lab은 등록, build/apply/import 확인, 명시적 Service Call, 명시적 Action Goal,
명시적 Topic Receive, Service/Action history를 다루는 작업 도구다.

구현 위치와 책임:

```text
interface_lab/management/
= registry, manual_type, manual_definition, single upload, package upload/list/delete,
  uploaded_interfaces metadata 재생성, CMakeLists.txt/package.xml 재생성

interface_lab/apply/
= apply 요청, colcon build, apply status, build log, install 경로 확인,
  import-check와 registry import 가능 여부 반영

interface_lab/execution/
= Topic Publish/Receive, Service Call, Action Goal, feedback/result/history,
  publisher/subscription/client cache, cleanup

interface_lab/common/
= schema 생성, payload validation, ROS generated object 생성,
  ROS message/response/feedback/result의 JSON-safe 변환

interface_lab/paths.py
= module 위치가 바뀌어도 유지되어야 하는 backend workspace root,
  Python package root, reload_trigger.py 경로 계산
```

원칙:

```text
Interface Lab 사용자 데이터 경로는 코드 모듈 위치와 분리한다.
registry/package/apply/uploaded data 경로를 __file__.parent 임시 계산으로 만들지 않는다.
backend/config와 backend/src/uploaded_*의 기존 데이터를 새 빈 파일로 덮어쓰지 않는다.
management는 ROS2 publish/call/goal 실행을 하지 않는다.
apply는 interface 파일 생성/삭제 책임을 가져오지 않는다.
execution runtime은 registry/schema 조회는 가능하지만 파일 관리와 colcon build를 직접 하지 않는다.
```

등록 방식:

```text
manual_type
= 이미 설치/import 가능한 type을 registry에 등록한다. 파일을 만들지 않고 build가 필요 없다.

manual_definition
= 사용자가 .msg/.srv/.action 정의를 직접 입력한다.
  backend/src/uploaded_interfaces/<msg|srv|action>/에 파일을 쓰고 build가 필요하다.

single_upload
= 단일 .msg/.srv/.action 파일 업로드.
  기본 대상은 backend/src/uploaded_interfaces이며 build가 필요하다.

package_upload
= zip 또는 folder로 완성된 ROS interface package 업로드.
  backend/src/uploaded_interface_packages/<package_name>/에 package 단위로 저장한다.
```

저장 위치:

```text
backend/config/interface_registry.yaml
= manual_type, manual_definition, single_upload 개별 interface registry

backend/config/interface_packages.yaml
= package_upload 기록. 단일 interface 삭제 시 건드리지 않는다.

backend/config/interface_apply_status.yaml
= 마지막 pending/build/import/apply 상태

backend/src/uploaded_interfaces
= 직접 작성/단일 업로드 파일을 모은 하나의 ROS interface package

backend/src/uploaded_interface_packages
= 업로드된 ROS interface package를 package 이름 그대로 보존하는 저장소

backend/src/ros2_dashboard_interfaces
= MonitorStatus.msg, KeyValue.msg 등 프로젝트 내장 공통 interface package
```

`uploaded_interfaces`와 `uploaded_interface_packages`는 역할이 다르다.
삭제, registry, build metadata를 서로 섞지 않는다.

`uploaded_interfaces` metadata 재생성 원칙:

```text
interface_lab/management/manual_interfaces.py의 scan_uploaded_interface_files()로
실제 남은 .msg/.srv/.action 파일을 다시 스캔한다.
regenerate_uploaded_interfaces_cmake()는 append하지 않고 CMakeLists.txt 전체를 다시 쓴다.
regenerate_uploaded_interfaces_package_xml()도 현재 파일 수 기준으로 전체를 다시 쓴다.
regenerate_uploaded_interfaces_package()는 위 과정을 묶는 재사용 함수다.
```

interface 파일이 1개 이상이면:

```text
find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
rosidl_generate_interfaces(${PROJECT_NAME} ...)
ament_export_dependencies(rosidl_default_runtime)
ament_package()
```

interface 파일이 0개이면:

```text
rosidl_generate_interfaces() 호출을 남기지 않는다.
uploaded_interfaces는 최소 ament_cmake 빈 package로 build 가능해야 한다.
package.xml도 rosidl 관련 의존성을 제거하거나 build 가능한 빈 package 상태를 유지한다.
```

삭제 생명주기:

```text
삭제 API는 source/full_type/kind/file_name에 맞는 정확한 항목만 제거한다.
manual_definition 또는 single_upload 파일 삭제 후 uploaded_interfaces metadata를 반드시 재생성한다.
config/interface_registry.yaml에서 삭제된 entry를 제거한다.
config/interface_packages.yaml과 uploaded_interface_packages의 다른 package는 건드리지 않는다.
mark_interface_change_pending()으로 build_required/rebuild_required 상태를 남긴다.
frontend는 삭제 성공 후 registry/package/callable/apply 상태를 다시 fetch한다.
```

apply/import:

```text
POST /ros/interfaces/apply는 backend workspace에서 colcon build --symlink-install을 실행한다.
build log는 backend/config/interface_apply_last.log에 저장한다.
상태는 backend/config/interface_apply_status.yaml에 저장한다.
동시 apply는 lock으로 막는다.
build 성공 후 import-check로 generated Python import 가능 여부를 registry에 반영한다.
build 성공 시 reload_trigger.py를 갱신해 uvicorn --reload 감지를 유도한다.
backend 프로세스를 직접 kill/restart하거나 systemd/tmux를 제어하지 않는다.
```

## 13. Receive와 History 정책

Topic Receive:

```text
interface_lab/execution/topic_runtime.py의 InterfaceReceiveRuntime만 명시적 Topic subscription을 생성한다.
start_topic / stop_topic / topics / topic_history / reset_topic_history 흐름을 유지한다.
일반 Topic monitoring의 자동 subscription과 목적이 다르다.
```

Service history:

```text
Service는 Topic처럼 response topic을 subscribe하는 구조가 아니다.
interface_lab/execution/service_call_runtime.py의 ServiceCallRuntime 명시적 호출 history에서
response history를 제공한다.
reset은 timestamp 경계를 갱신해 이전 event를 숨기는 방식이다.
```

Action history:

```text
Action history는 별도 "수신 구독 시작" 구조가 아니다.
interface_lab/execution/action_goal_runtime.py의 ActionGoalRuntime 사용자 Goal 실행에서 발생한
feedback/result event를 history로 제공한다.
기존 ActionRuntime은 Graph/status/feedback 관찰을 계속 담당한다.
```

## 14. MonitorStatus / KeyValue 정책

공통 interface:

```text
KeyValue.msg

string key
string value
string value_type
string unit
```

```text
MonitorStatus.msg

string device_name
string node_name
string source
string level
string status
string message
builtin_interfaces/Time stamp
KeyValue[] values
```

백엔드는 `values`의 key 의미를 깊게 해석하지 않는다.

해야 할 일:

```text
MonitorStatus 수신
수신 시간 기록
Hz 계산
stale 판단
alert 판단
values를 안전한 JSON 배열로 변환
```

하지 않을 일:

```text
node_id, port, error_code 같은 key 의미를 임의 해석
장치별 custom rule을 기본 동작에 하드코딩
```

## 15. Alert 정책

`GET /ros/alerts`는 공통 alert item 구조를 유지한다.

권장 필드:

```text
id
level
source
name
code
message
status
last_received_at
age_sec
detected_at
```

level:

```text
info
warning
error
critical
```

source:

```text
topic
monitor_status
service
node
action
```

Topic alert 기준:

```text
required stream topic 또는 명시적 monitoring target만 기본 topic alert 대상이다.
command topic은 명령이 있을 때만 발행될 수 있으므로 waiting_publisher,
topic_message_missing, topic_stale을 기본 alert로 만들지 않는다.
publisher_count > 0 and subscriber_count == 0은 기본 alert로 보지 않는다.
```

MonitorStatus alert 기준:

```text
level warning  → monitor_status_warning
level error    → monitor_status_error
level critical → monitor_status_critical
level info / active / empty → alert 아님
```

Service alert 기준:

```text
allowlist active_check의 timeout / failed / error만 alert로 표시한다.
waiting_server, type_mismatch, 상태만 표시는 기본 alert로 보지 않는다.
```

Action alert 기준:

```text
last_goal_status aborted
→ action_goal_aborted

last_goal_status canceled
→ action_goal_canceled

result_error 있음
→ action_result_unavailable

waiting_server, Goal 미관찰, 단순 result unavailable은 기본 alert로 보지 않는다.
```

## 16. FastAPI + rclpy 실행 구조

권장 구조:

```text
FastAPI lifespan에서 monitor runtime 시작
rclpy Monitor Node 생성
rclpy spin은 background thread에서 실행
timer로 graph/cache 갱신
FastAPI endpoint는 cache snapshot 또는 명시 요청 runtime 결과만 반환
```

금지:

```text
endpoint 안에서 rclpy.spin() 호출
endpoint 호출마다 ROS2 node 생성
Context 직접 생성/전달
Executor 직접 제어
rclpy private/internal 속성 사용
공유 cache lock 없이 접근
```

종료 시 `destroy_node()`와 `rclpy.shutdown()`을 처리한다.

## 17. Frontend UI 정책

공통 원칙:

```text
Topic / Service / Action / Node 화면의 기본 탭은 주요 항목이다.
전체, 대기/오류, 미수신, 미지원, 숨김/내부 포함 등은 별도 탭으로 제공한다.
목록 화면의 count 숫자는 유지하고, 상세 패널에서 실제 연결 Node 목록을 보여준다.
상세 패널 항목명은 한글 중심으로 통일한다.
ROS2 고유 용어 Topic / Service / Action / Node / Goal은 그대로 사용할 수 있다.
긴 Topic/Service/Action/Node 이름은 줄바꿈 처리하고 가로 스크롤을 만들지 않는다.
```

Frontend polling 정책:

```text
공통 polling은 frontend/src/hooks/usePolling.js를 사용한다.
setInterval/setTimeout은 cleanup에서 반드시 clearInterval/clearTimeout 한다.
polling effect를 응답 data/latest/hz state에 의존시키지 않는다.
fetcher 함수 identity 때문에 interval이 매 render 재생성되지 않도록 resetKey를 명시한다.
Topic 상세 latest/hz는 Topics 화면에서 선택된 Topic에 대해서만 실행한다.
/_action/feedback, /_action/status, /_service_event, /clock, /rosout 등 내부 Topic은
Topic 상세 기본 선택 후보와 목록용 Hz polling 후보에서 제외한다.
숨김 포함 해제 후 표시 Topic이 0개이면 selectedTopicName은 빈 값으로 안정화하고
다른 hook이 다시 내부 Topic을 기본 선택하지 않게 한다.
App.jsx는 activePage 기준으로 필요한 dashboard hook만 polling enabled 처리한다.
WebSocket reconnect가 REST polling timer를 추가 생성하면 안 된다.
```

Interface Lab UI:

```text
/interface-lab route는 InterfaceLabPage를 표시한다.
InterfaceUploadControl은 등록 방식 선택, package upload, 삭제, apply,
Service Call, Action Goal, Topic Receive/history 조작을 연결한다.
registry row와 package row는 type/full_type 기준으로 병합한다.
Service/Action 실행 후보는 graph name과 full_type exact match를 보존한다.
schema 기반 동적 form은 nested custom msg 입력을 지원한다.
삭제 성공 후 registry/package/callable/apply 상태를 다시 fetch한다.
failed to fetch 같은 원문 에러는 사용자가 이해 가능한 한글 설명으로 표시한다.
Topic Publish의 Graph 후보와 Topic Receive 후보는 의미가 다르므로 상태를 묶어 자동 변경하지 않는다.
Publish Graph 후보는 exact Message full_type 일치와 Action 내부 Topic 제외 규칙을 적용한다.
Publish Topic name 직접 입력은 새 Topic Publisher 생성 경로로 유지한다.
Message import됨만 보기 체크 여부는 Message 목록만 필터링하며,
Topic Receive Graph 후보의 exact Message full_type 비교는 체크/해제 상태와 관계없이 유지한다.
Receive Graph 후보 변경 시 이전 자동/후보 선택값만 갱신하고 사용자가 직접 입력한 Topic 이름은 보존한다.
```

Frontend participant map 정책:

```text
/ros/nodes 응답의 node 기준 관계를 프론트에서 역매핑해
Topic / Service / Action 상세 패널에 실제 연결 Node 목록을 표시한다.
topic_publishers / topic_subscribers → 발행자 Node / 구독자 Node
service_servers / service_clients → 응답자 Node / 요청자 Node
action_servers / action_clients → Goal 실행자 Node / Goal 요청자 Node
백엔드 API 응답 구조를 바꾸지 않고 프론트 데이터 가공으로 처리한다.
```

Visualization 화면 정책:

```text
통신 시각화는 React Flow(@xyflow/react)를 사용한다.
첫 진입 화면은 노드 중심이다.
노드 중심은 Node 목록을 크게 보여주고, Node 선택 시 연결 중심으로 이동한다.
연결 중심은 선택 Node와 직접 연결된 Topic / Service / Action 1-hop 관계만 표시한다.
전체 중심 또는 전체 보기는 고급 확인용이며 ROS2 Graph가 복잡할 수 있다는 경고를 표시한다.
React Flow 그래프는 polling마다 remount하거나 자동 fitView 하지 않는다.
fitView는 최초 필요 시 또는 사용자가 버튼을 눌렀을 때만 실행한다.
nodes/edges id는 안정적으로 유지하고 Date.now()/Math.random()으로 만들지 않는다.
```

## 18. 작업 명령

Backend:

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
colcon test
source install/setup.bash
```

Backend Python tests:

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source install/setup.bash
cd src/ros2_dashboard_backend
python3 -m pytest test
```

FastAPI:

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source install/setup.bash
python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

Frontend:

```bash
cd ~/rang/ros2_dashboard/frontend
npm install
npm run dev
npm run build
npm run lint
```

검증을 못 돌렸으면 이유를 명확히 보고한다.

## 19. Codex 작업 제한

금지:

```text
사용자 요청 없는 frontend/backend 동시 대규모 변경
기존 API 제거
기존 JSON key 제거
기존 파일/폴더 구조 임의 변경
필요 없는 새 구조 생성
DB / 인증 / JWT 추가
외부 라이브러리 임의 추가
rclpy를 pip로 설치
생성물 폴더 직접 수정
WebSocket 임의 구현
사용자 승인 없는 Service request 전송
사용자 승인 없는 Action Goal 전송
Action cancel 전송 기능 임의 추가
관찰하지 않은 goal_id에 대한 Action get_result 전송
장비 제어 기능 임의 구현
```

허용 Python 패키지:

```text
fastapi
uvicorn
python-dotenv
PyYAML
ROS2 Jazzy 환경에 포함된 rclpy 및 ROS2 표준 패키지
```

새 라이브러리가 필요하면 먼저 이유를 설명하고 사용자 확인을 받는다.

## 20. Codex 응답 방식

전체 코드를 길게 출력하지 않는다.

기본 보고 형식:

```text
수정 파일 목록
핵심 변경 내용
실행 명령
검증 결과
주의할 점
```

불확실한 부분은 확실한 것처럼 말하지 않는다.
실행하지 못한 검증은 실행하지 못했다고 말한다.
