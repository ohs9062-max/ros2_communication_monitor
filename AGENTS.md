# AGENTS Codex Lite

이 파일은 `AGENTS.md`를 Codex 작업용으로 경량화한 비교본이다.
원본 `AGENTS.md`는 수정하지 않는다.

## 1. 목적

Codex는 `ros2_dashboard` 작업 시 아래 원칙을 우선한다.

```text
불필요한 구조 변경 방지
기존 API 경로와 응답 key 유지
ROS2 / FastAPI / React / Electron 역할 분리
ROS2 CLI subprocess 구현 금지
ROS2 Graph API 기반 자동 발견
하드코딩된 로봇 토픽 이름 의존 금지
Topic 중심 기능을 안정화한 뒤 Node / Service / Action으로 확장
```

사용자용 긴 설명은 `README.md`에 둔다.
Codex 작업 제한, 금지사항, 설계 원칙은 이 파일 기준으로 판단한다.

## 2. 프로젝트 정의

이 프로젝트는 ROS2에서 실행 중인 Node, Topic, Service, Action의
통신 상태를 수집하고, FastAPI backend와 Electron + React dashboard에서
확인하는 ROS2 Communication Monitor Dashboard이다.

목표는 단순 목록 표시가 아니라 ROS2 시스템 디버깅과 운영 상태 확인이다.

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
├─ agemts_codex.md
├─ README.md
├─ backend/
│  ├─ .env
│  ├─ config/
│  │  └─ monitor.yaml
│  ├─ build/              # 생성물, 직접 수정 금지
│  ├─ install/            # 생성물, 직접 수정 금지
│  ├─ log/                # 생성물, 직접 수정 금지
│  └─ src/
│     ├─ ros2_dashboard_backend/
│     │  ├─ package.xml
│     │  ├─ setup.py
│     │  ├─ setup.cfg
│     │  ├─ resource/
│     │  ├─ test/
│     │  └─ ros2_dashboard_backend/
│     │     ├─ __init__.py
│     │     ├─ config_loader.py
│     │     ├─ main.py
│     │     ├─ ros_monitor.py
│     │     ├─ action/
│     │     │  ├─ __init__.py
│     │     │  ├─ alerts.py
│     │     │  ├─ discovery.py
│     │     │  ├─ filters.py
│     │     │  ├─ models.py
│     │     │  └─ subscriptions.py
│     │     ├─ service/
│     │     │  ├─ __init__.py
│     │     │  ├─ alerts.py
│     │     │  ├─ active_check.py
│     │     │  ├─ discovery.py
│     │     │  ├─ filters.py
│     │     │  ├─ introspection.py
│     │     │  ├─ introspection_test_nodes.py
│     │     │  └─ models.py
│     │     └─ topic/
│     │        ├─ __init__.py
│     │        ├─ alerts.py
│     │        ├─ discovery.py
│     │        ├─ filters.py
│     │        ├─ hz.py
│     │        ├─ models.py
│     │        ├─ preview.py
│     │        └─ subscriptions.py
│     └─ ros2_dashboard_interfaces/
│        ├─ package.xml
│        ├─ CMakeLists.txt
│        └─ msg/
│           ├─ KeyValue.msg
│           └─ MonitorStatus.msg
└─ frontend/
   ├─ package.json
   ├─ index.html
   ├─ src/
   └─ public/
```

역할 기준:

```text
backend/
= ROS2 workspace 역할

backend/src/ros2_dashboard_backend/
= ROS2 ament_python backend 패키지

ros_monitor.py
= rclpy Node 생성, spin thread, runtime 조립, public API용 snapshot 제공

topic/
= Topic discovery / filter / subscription / preview / hz / alert 로직

service/
= Service graph 조회 / filter / status / alert 로직
  active_check는 allowlist 대상만 안전하게 호출

ros2_dashboard_interfaces/
= 공통 장치 상태 모니터링용 ROS2 interface 패키지

action/
= Action graph 조회 / status-feedback topic 관찰 / alert 로직
  Goal, cancel, result request는 보내지 않는다

frontend/
= Vite React + Electron UI
```

`backend/build/`, `backend/install/`, `backend/log/`,
`frontend/node_modules/`는 생성물이다. 직접 수정하지 않는다.

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
REST API
        ↓
React UI
        ↓
Electron Desktop App
```

React/Electron은 ROS2에 직접 접근하지 않는다.

```text
React / Electron → FastAPI → Python rclpy → ROS2
```

## 6. 현재 구현 기준

구현된 API:

```text
GET /health
GET /ros/topics
GET /ros/topics/latest?name=...
GET /ros/topics/hz?name=...
GET /ros/services
GET /ros/actions
GET /ros/alerts
```

Topic 구현 범위:

```text
Graph API 기반 topic 자동 발견
include / exclude filter
publisher_count / subscriber_count 조회
raw / monitor / external subscriber count 구분
status / reason 판단
지원 message type 자동 deep monitoring
latest message preview
Hz 계산
last_received_at / age_sec / is_stale / status 계산
Topic alert
MonitorStatus key-value preview
MonitorStatus level 기반 alert
사라진 topic subscription grace cleanup
```

Service 구현 범위:

```text
Graph API 기반 service 목록 조회
parameter service 기본 제외
action_internal service 기본 숨김
service type 조회
server_count / client_count 조회
status / reason 판단
waiting_server alert 생성 가능
allowlist 기반 active_check
service introspection 테스트 노드
```

Service active_check는 allowlist에 등록된 안전한 service만 호출한다.
장비 제어 service를 임의 호출하지 않는다.

Action 구현 범위:

```text
rclpy.action.graph 기반 action 목록 조회
action type 조회
node별 action server/client graph count 계산
status / reason 판단
status topic 관찰(action_msgs/msg/GoalStatusArray)
feedback topic type import 가능 시 관찰
runtime last_goal_status / last_goal_id / feedback_preview cache
waiting_server / aborted / canceled alert
result_supported=false 기본 표시
```

Action backend는 Goal, cancel, get_result 요청을 직접 보내지 않는다.

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
```

원칙:

```text
.env에 ROS2 감시 대상 목록을 넣지 않는다.
frontend에 ROS2 감시 대상 목록을 넣지 않는다.
설정 파일이 없어도 safe default로 서버가 죽지 않아야 한다.
Gazebo/TurtleBot3 topic 이름을 Python 코드에 하드코딩하지 않는다.
```

## 8. ROS2 Graph API 정책

ROS2 CLI를 subprocess로 실행하지 않는다.

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

CLI 출력 파싱으로 모니터링 기능을 만들지 않는다.

## 9. Topic 자동 발견 정책

대시보드는 특정 토픽 이름에 의존하면 안 된다.

예시 토픽 이름:

```text
/scan
/odom
/cmd_vel
/imu
/joint_states
```

위 이름은 테스트나 문서 예시에는 사용할 수 있지만,
대시보드 동작의 필수 조건이면 안 된다.

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

`std_msgs/msg/String`은 정적 설명용 topic에 많이 쓰이므로
기본 자동 deep monitoring 대상에서 제외할 수 있다.

## 10. Service 모니터링 정책

Service는 Topic처럼 지속 메시지를 흘리지 않는다.

Service 기본 모니터링은 graph 상태를 우선 다룬다.
active_check는 allowlist 대상만 별도 background cache로 다룬다.

```text
service name
service type
server_count
client_count
status
reason
supported_type
last_updated
```

상태 기준:

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
```

절대 하지 말 것:

```text
사용자 승인 없는 Service call 테스트 구현
allowlist 밖 Service request 전송
장비가 움직일 수 있는 service 임의 호출
```

## 11. Action 모니터링 정책

Action은 내부적으로 service와 topic을 사용하지만,
대시보드 API는 Action 단위로 묶어서 표시한다.

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

상태 기준:

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

금지:

```text
Action Goal 직접 전송
Action cancel 직접 전송
관찰하지 않은 goal_id에 대한 Action get_result 직접 호출
Action active_check 구현
장비가 움직일 수 있는 action 임의 호출
```

Result는 기본적으로 action client 참여나 runtime event reporting이
필요하다. Action type import가 가능하면 status topic에서 관찰된
terminal goal_id에 한해 `result_supported=true`,
`result_policy=observed_goal_only`로 get_result 조회를 시도할 수 있다.
Action type import가 불가능하면 `result_supported=false`와 reason을 표시한다.

백엔드는 새 Goal, cancel 요청을 보내지 않는다.
get_result도 임의 goal_id가 아니라 관찰된 goal_id만 대상으로 한다.

## 12. MonitorStatus / KeyValue 정책

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

## 13. Alert 정책

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
publisher_count == 0 and subscriber_count > 0
→ waiting_publisher

publisher_count > 0 and last_received_at is None
→ topic_message_missing

publisher_count > 0 and age_sec > stale_timeout_sec
→ topic_stale

publisher_count == 0 and subscriber_count == 0
→ topic_inactive
```

주의:

```text
publisher_count > 0 and subscriber_count == 0 은 기본 alert로 보지 않는다.
센서 topic은 발행만 하고 외부 subscriber가 없어도 정상일 수 있다.
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
status waiting_server
→ service_waiting_server
```

Action alert 기준:

```text
status waiting_server
→ action_waiting_server

last_goal_status aborted
→ action_goal_aborted

last_goal_status canceled
→ action_goal_canceled
```

## 14. FastAPI + rclpy 실행 구조

권장 구조:

```text
FastAPI lifespan에서 monitor runtime 시작
rclpy Monitor Node 생성
rclpy spin은 background thread에서 실행
timer로 graph/cache 갱신
FastAPI endpoint는 cache snapshot만 반환
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

## 15. API 응답 기준

기존 API 경로와 JSON key를 제거하지 않는다.
응답 wrapper를 대규모 변경하지 않는다.

기본 예:

```json
{
  "success": true,
  "data": {},
  "message": "..."
}
```

목록 API는 필요 시 `meta`를 포함한다.

`/ros/services`는 현재 service 목록 응답 구조를 유지한다.

```json
{
  "ok": true,
  "data": {
    "services": [],
    "meta": {
      "count": 0,
      "active_count": 0,
      "warning_count": 0,
      "error_count": 0,
      "last_updated": 0.0
    }
  }
}
```

`/ros/actions`는 현재 action 목록 응답 구조를 유지한다.

```json
{
  "ok": true,
  "data": {
    "actions": [],
    "meta": {
      "count": 0,
      "active_count": 0,
      "warning_count": 0,
      "error_count": 0,
      "server_count": 0,
      "client_count": 0,
      "last_updated": 0.0
    }
  }
}
```

## 16. 작업 명령

Backend:

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
colcon test
source install/setup.bash
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

## 17. 검증 기준

Backend 변경 후 가능한 확인:

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
colcon test
```

API 확인:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ros/topics | python3 -m json.tool
curl http://127.0.0.1:8000/ros/services | python3 -m json.tool
curl http://127.0.0.1:8000/ros/actions | python3 -m json.tool
curl http://127.0.0.1:8000/ros/alerts | python3 -m json.tool
```

Frontend 변경 후 가능한 확인:

```bash
cd ~/rang/ros2_dashboard/frontend
npm run lint
npm run build
```

검증을 못 돌렸으면 이유를 명확히 보고한다.

## 18. Codex 작업 제한

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
Service call / request 전송 구현
Action Goal / cancel / get_result 전송 구현
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

## 19. Codex 응답 방식

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

## 20. 현재 확장 방향

기본 우선순위:

```text
1. Topic 자동 발견 안정화
2. 지원 message type 자동 deep monitoring
3. latest / hz / stale / alerts cache 안정화
4. Service graph 목록 안정화
5. Action graph 목록과 status/feedback 관찰 안정화
6. Node / Service detail / Action detail 확장
7. Frontend / Electron 매핑 고도화
```

핵심 방향:

```text
토픽 이름 하드코딩이 아니라 ROS2 Graph API 자동 발견
메시지 타입 기준 자동 subscribe
기존 cache 재사용
Service는 call 없이 graph 상태부터 안전하게 표시
Action은 Goal 없이 graph와 status/feedback topic만 안전하게 관찰
```

## 21. 최근 작업 반영

```text
Service backend:
- Graph API 기반 /ros/services 구현
- parameter/action_internal/ros_internal service 기본 숨김
- allowlist 기반 active_check 구현
- service alert를 /ros/alerts에 병합

Action backend:
- rclpy.action.graph 기반 /ros/actions 구현
- action server/client count는 node별 action graph 기준으로 계산
- status topic은 action_msgs/msg/GoalStatusArray 구독
- feedback topic은 generated feedback message class import 가능 시 구독
- goal_id별 accepted/executing/finished 시각과 elapsed_time_ms 기록
- get_result는 관찰된 terminal goal_id에 대해서만 중복 없이 조회
- result_preview / result_error / result_status를 runtime에 표시
- action alert를 /ros/alerts에 병합

Frontend:
- Service 탭 목록/상세/필터/숨김 Service 토글 구현
- Action 탭 목록/상세/runtime/result/feedback 표시 구현
- Action 탭은 조회 전용이며 Goal/cancel/result 요청 버튼을 만들지 않는다
- Total 화면에 Topic/Service/Action/Alert 요약과 백분율 차트 구현
- 사이드바 확장 시 본문을 밀어 화면을 가리지 않게 처리
```

ros2_dashboard.txt 기준 장기 목표:

```text
대시보드는 Node, Topic, Service, Action 상태와 시스템 경고를 한 화면에서 확인한다.
Topic은 목록, Publisher / Subscriber, Hz, 연결 상태, 메시지 미수신 경고를 제공한다.
Service는 graph 상태를 기본으로 하고 allowlist active_check만 안전하게 확장한다.
Action은 Goal 전송 없이 graph와 status/feedback topic 관찰부터 확장한다.
Node는 별도 단계에서 node 목록, 실행 상태, publish / subscribe 관계, 비정상 종료 감지로 확장한다.
통신 구조 시각화는 ROS2 graph cache를 기반으로 하며 CLI 출력 파싱에 의존하지 않는다.
WebSocket은 장기 목표일 수 있으나 현재 단계에서는 임의 구현하지 않고 REST API와 cache snapshot을 우선한다.
```

## 22. Codex 작업 기록

2026-07-09 Service 모니터링 1차 backend 보완:

```text
GET /ros/services는 service cache snapshot만 반환한다.
Service discovery는 get_service_names_and_types(), count_services()를 사용한다.
count_clients()가 없는 rclpy 환경에서는 client_count를 0으로 안전 처리한다.
Service type은 */srv/* 형태가 아니면 unknown으로 판단한다.
parameter service suffix는 기본 제외한다.
get_type_description 같은 ROS2 내부 helper service suffix는 기본 제외한다.
waiting_server service alert는 기존 /ros/alerts 응답에 추가한다.
Service call, request 전송, latest, hz, stale 기능은 구현하지 않는다.
Topic API와 rclpy spin 구조는 변경하지 않는다.
```

2026-07-09 Service 표시 정책 정리:

```text
GET /ros/services 기본 응답은 user service만 services 배열에 반환한다.
GET /ros/services?include_hidden=true 는 user / hidden service를 모두 반환한다.
각 service item은 category와 hidden_by_default를 포함한다.
category는 user, parameter, action_internal, ros_internal, unknown 중 하나다.
parameter service suffix와 /_action/ service, get_type_description helper는 기본 숨김이다.
unknown category는 사용자 화면 오염을 막기 위해 기본 숨김으로 둔다.
meta는 visible_count, hidden_count, user_count, parameter_count,
action_internal_count, ros_internal_count, unknown_count를 포함한다.
hidden service의 waiting_server는 /ros/alerts 기본 alert 대상에서 제외한다.
Service call, request/response 수집, 응답 시간 측정은 구현하지 않는다.
```

2026-07-09 Service active_check 1차 구현:

```text
Service active_check는 monitor.yaml services.active_check.allowlist 대상만 호출한다.
allowlist에 없는 service, hidden service, parameter service, action_internal service,
ros_internal service, unknown service는 호출하지 않는다.
FastAPI endpoint는 service call을 실행하지 않고 active_check cache만 반환한다.
백그라운드 monitor loop에서 interval_sec마다 allowlist 대상만 call_async로 확인한다.
pending future는 start time과 timeout_sec을 추적해 timeout을 기록한다.
응답 완료는 future callback으로 기록하고 timeout은 monitor loop에서 별도 확인한다.
request 설정이 없거나 잘못된 allowlist 항목은 호출하지 않고 error 상태로 기록한다.
success_field가 null이면 정상 응답을 success로 보고, 지정되면 response field 값으로 판단한다.
active_check 실패/timeout/error/type_mismatch/waiting_server는 service alert로 추가한다.
/cmd_service, /CanControl 등 allowlist 밖 service는 active_check_supported=false 여야 한다.
```

2026-07-09 Service introspection 테스트 노드 추가:

```text
rclpy Jazzy Service server/client 객체는 configure_introspection을 지원한다.
API 형태는 configure_introspection(clock, qos_profile, ServiceIntrospectionState)이다.
테스트용 /introspection_add_two_ints server/client만 추가하고 /cmd_service는 호출하지 않는다.
테스트 server/client는 ServiceIntrospectionState.CONTENTS와 qos_profile_services_default를 사용한다.
수동 client 실행 시 ros2 service echo /introspection_add_two_ints에서 request/response event를 확인했다.
실제 hidden event topic은 /introspection_add_two_ints/_service_event 이고
type은 example_interfaces/srv/AddTwoInts_Event 이다.
일반 ros2 topic list -t에는 보이지 않고 --include-hidden-topics 옵션에서 확인된다.
백엔드 구독은 service Event class와 hidden event topic을 이용하는 helper 초안만 추가했다.
active_check 구조, Topic 기능, /cmd_service, /CanControl은 변경하거나 자동 호출하지 않는다.
```

2026-07-09 Frontend Service 모니터링 화면 추가:

```text
Frontend Services 화면은 GET /ros/services와 /ros/services?include_hidden=true를 조회만 한다.
프론트엔드에서 service call, active_check 설정 변경, YAML 수정 UI를 만들지 않는다.
Service 목록은 3초 polling으로 갱신하고 Topic 1초 polling 구조는 변경하지 않는다.
Service item의 category, hidden_by_default, active_check_supported, active_check를 표시한다.
allowlist 밖 service는 측정 미지원으로 보여주고 호출 결과/응답 시간은 표시하지 않는다.
Service alert는 /ros/alerts에서 source=service인 항목만 Services 화면에 표시한다.
기존 Topic 화면과 alert wrapper는 변경하지 않는다.
```
