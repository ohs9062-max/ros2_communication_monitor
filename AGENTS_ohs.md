# AGENTS.md

## 1. 이 파일의 목적

이 파일은 Codex가 `ros2_dashboard` 프로젝트에서 작업할 때
항상 먼저 읽어야 하는 기본 작업 지침이다.

목적은 다음과 같다.

```text
불필요한 구조 변경 방지
기존 응답 형식 유지
ROS2 / FastAPI / React / Electron 역할 분리
subprocess 기반 구현 방지
하드코딩된 ROS2 토픽 이름 의존 방지
Topic 모니터링 기능을 기준으로 점진 확장
```

긴 설명과 사용자용 문서는 `README.md`에 둘 수 있다.  
Codex 작업 기준, 금지사항, 설계 원칙은 이 파일을 우선한다.

---

## 2. 프로젝트 한 줄 정의

이 프로젝트는 ROS2에서 실행 중인 Node, Topic, Service, Action의
통신 상태를 수집하고, Electron + React 대시보드에서 확인하는
ROS2 Communication Monitor Dashboard이다.

단순 CRUD 게시판이 아니라,
ROS2 시스템 디버깅과 운영 상태 확인을 위한 모니터링 도구이다.

---

---
아래 블록만 `AGENTS.md`에 추가하면 돼.
위치는 **ROS2 Topic 자동 발견 정책 아래** 또는 **현재 구현/확장 방향 섹션 근처**가 좋아.

````markdown id="q0wuno"
## 공통 장치 모니터링 인터페이스 정책

이 프로젝트는 ROS2 기본 토픽만 보여주는 도구가 아니다.

목표는 사용자가 연결한 실제 장치의 Node, Topic, Service, Action
통신 상태를 실시간으로 모니터링하는 것이다.

따라서 백엔드는 장치별 의미를 모두 해석하려고 하지 않는다.
백엔드는 수신, 정리, 상태 계산, 전달에 집중한다.
장치 값의 의미 해석은 대시보드 사용자 또는 추후 규칙이 담당한다.

---

### 핵심 원칙

모르는 장치라도 최소한 다음 정보는 표시할 수 있어야 한다.

- node 이름
- topic / service / action 이름
- message type 이름
- publisher / subscriber 수
- service server / client 존재 여부
- action server / client 존재 여부
- 마지막 수신 시간
- Hz
- stale 여부
- alert 여부

장치별 custom message 구조를 모르는 경우에도
ROS2 Graph API 기반 기본 모니터링은 가능해야 한다.

---

### 공통 key-value 상태 메시지

장치별 custom interface를 매번 새로 해석하지 않기 위해
공통 모니터링 interface를 사용할 수 있다.

권장 구조는 다음과 같다.

```text
KeyValue.msg

string key
string value
string value_type
string unit
````

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

`values`는 딕셔너리처럼 사용한다.

예:

```text
values:
- key: "node_id"
  value: "1"
  value_type: "int"
  unit: ""

- key: "port"
  value: "3"
  value_type: "int"
  unit: ""

- key: "temperature"
  value: "31.5"
  value_type: "float"
  unit: "C"

- key: "error_code"
  value: "TIMEOUT"
  value_type: "string"
  unit: ""
```

---

### 백엔드 역할

백엔드는 key-value의 의미를 장치별로 깊게 해석하지 않는다.

백엔드가 해야 할 일:

* 공통 MonitorStatus 메시지 수신
* 수신 시간 기록
* Hz 계산
* stale 판단
* alert 판단
* key-value 배열을 JSON으로 변환
* 프론트엔드에 전달

백엔드가 기본적으로 하지 않을 일:

* `node_id`가 어떤 물리 장치인지 해석
* `port`가 어떤 센서 위치인지 해석
* `sensor_value`의 장치별 의미 해석
* 장치별 error_code 의미를 임의로 해석

단, 추후 공통 key 규칙이나 장치별 rule이 추가된 경우에는
선택적으로 해석할 수 있다.

---

### 대시보드 표시 방식

대시보드는 수신한 key-value를 그대로 표시할 수 있어야 한다.

예:

```text
장치명: toilet_sensor_1
노드명: toilet_sensor_node
상태: warning
메시지: sensor timeout
마지막 수신: 0.3초 전
Hz: 5.0

key           value      type     unit
node_id       1          int
port          3          int
temperature   31.5       float    C
error_code    TIMEOUT    string
```

처음 보는 장치라도 key와 value를 표로 보여주면 된다.

---

### Topic / Service / Action과의 관계

key-value 구조는 Topic에서만 사용할 수 있는 것이 아니다.

다음 구조에서도 사용할 수 있다.

* Topic msg
* Service srv Request / Response
* Action Goal / Feedback / Result

다만 실시간 상태 모니터링에는 Topic이 가장 적합하다.

권장 역할:

```text
Topic
= 장치 상태, 이벤트, heartbeat 실시간 보고

Service
= 짧은 명령, 설정 변경, 즉시 조회

Action
= 오래 걸리는 작업, 진행률, 최종 결과 추적
```

따라서 장치 상태와 이벤트는 가능한 경우
공통 MonitorStatus 또는 MonitorEvent Topic으로 발행하는 것을 권장한다.

---

### 모니터링 단계

이 프로젝트는 장치 모니터링을 단계적으로 지원한다.

1. Graph 기반 기본 모니터링

   * interface를 몰라도 가능
   * node/topic/service/action 이름과 연결 상태 표시

2. 표준 ROS2 타입 모니터링

   * LaserScan, Odometry, Imu 등
   * preview builder가 있는 타입은 latest / hz / stale 표시

3. 공통 MonitorStatus 모니터링

   * 장치가 key-value 상태를 발행
   * 대시보드는 장치 의미를 몰라도 values를 표로 표시

4. 장치별 고급 해석

   * 필요할 때만 추가
   * 특정 key 또는 error_code에 대한 rule 기반 표시

---

### 설계 제한

이 프로젝트는 ROS2 표준 타입만 지원하는 대시보드로 끝나면 안 된다.

새 장치가 연결되었을 때,
장치별 custom interface를 모른다는 이유만으로
대시보드에서 아무것도 보이지 않으면 안 된다.

최소한 Graph 기반 기본 상태는 보여야 한다.

공통 MonitorStatus interface를 사용하는 장치는
장치별 전용 preview builder 없이도
key-value 상태값을 실시간으로 표시할 수 있어야 한다.

장치별 의미 해석은 필수가 아니다.
모니터링 시스템의 기본 책임은
값을 정확히 수신하고, 끊김 없이 표시하는 것이다.

```
```
---

## 3. 기술 스택

```text
OS: Ubuntu 24.04
ROS2: Jazzy
ROS2 상태 수집: Python / rclpy
Backend API: FastAPI
Frontend UI: React
Desktop App: Electron
개발 서버: Vite
테스트용 ROS2 환경: TurtleBot3 + Gazebo
```

Node.js는 Vite 요구사항 때문에 Node 20 이상을 기준으로 한다.

---

## 4. 현재 프로젝트 구조 기준

기본 구조는 아래를 따른다.

```text
ros2_dashboard/
├─ AGENTS.md
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
│     │     ├─ service/
│     │     │  ├─ __init__.py
│     │     │  ├─ alerts.py
│     │     │  ├─ discovery.py
│     │     │  ├─ filters.py
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
│     │
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

역할 기준:

ros_monitor.py
= rclpy Node 생성, spin thread, 전체 runtime 조립,
  FastAPI가 호출하는 public method 유지

topic/
= Topic 관련 하위 로직을 분리하는 패키지

topic/models.py
= Topic 상태 문자열, alert level/code,
  공통 상수와 작은 안전 helper

topic/discovery.py
= ROS2 Graph API 결과를 /ros/topics item 구조로 변환

topic/filters.py
= include/exclude 필터와 supported/deep monitoring 판단

topic/subscriptions.py
= subscription cache entry 생성,
  중복 subscription 판단,
  callback 수신 cache 갱신 helper,
  사라진 topic subscription cleanup helper

topic/preview.py
= Topic latest message preview builder,
  supported preview type 판단,
  MonitorStatus key-value preview 변환

topic/hz.py
= timestamp window, message_count, Hz,
  age_sec, is_stale, status 계산

topic/alerts.py
= topic stale/waiting/inactive alert,
  MonitorStatus level 기반 alert,
  alert meta count 계산

service/
= Service 관련 graph 조회 로직을 분리하는 패키지

service/models.py
= Service 상태 문자열, alert level/code,
  service meta count helper

service/discovery.py
= ROS2 Graph API 결과를 /ros/services item 구조로 변환

service/filters.py
= parameter service 제외와 service include/exclude 판단

service/alerts.py
= service server 없음 / waiting_server alert 생성

ros2_dashboard_interfaces/
= 장치 상태 모니터링용 공통 ROS2 interface 패키지

KeyValue.msg
= key / value / value_type / unit 구조

MonitorStatus.msg
= 장치가 상태값을 key-value 형태로 보내는 공통 메시지
```

중요 기준:

```text
backend/
= ROS2 workspace 역할을 하는 백엔드 폴더

backend/src/ros2_dashboard_backend/
= ROS2 ament_python 패키지

backend/config/monitor.yaml
= ROS2 모니터링 정책 설정 파일

frontend/
= Vite React 프로젝트
```

`backend/build/`, `backend/install/`, `backend/log/`,
`frontend/node_modules/`는 생성물이다. 직접 수정하지 않는다.

루트 `ros2_dashboard/`에 `build/`, `install/`, `log/`가 생겼다면
잘못된 위치에서 `colcon build`를 실행한 흔적이다.  
정상 빌드는 항상 `backend/`에서 실행한다.

---

## 5. 전체 시스템 흐름

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

역할 구분:

```text
TurtleBot3 + Gazebo
= 실제 장비 대신 사용하는 ROS2 테스트 환경

rclpy Monitor Node
= ROS2 graph와 통신 상태를 수집하는 백엔드 내부 노드

FastAPI
= 수집한 상태를 JSON API로 제공

React
= 상태 정보를 표와 화면으로 표시

Electron
= React 화면을 데스크톱 앱처럼 실행
```

React/Electron에서 ROS2에 직접 접근하지 않는다.

권장 구조:

```text
React / Electron
→ FastAPI
→ Python rclpy
→ ROS2
```

---

## 6. 현재 구현된 백엔드 기능

현재 구현 기준은 Topic 중심 모니터링 백엔드이며,
Service는 graph 기반 목록 조회 1차 기능까지 구현한다.

구현된 API:

```text
GET /health
GET /ros/topics
GET /ros/topics/latest?name=...
GET /ros/topics/hz?name=...
GET /ros/services
GET /ros/alerts
```

현재 Topic 기능:

```text
Topic 목록 조회
Topic type 조회
publisher_count 조회
subscriber_count 조회
Topic status / reason 판단
monitor.yaml 기반 include / exclude 필터
지원 타입 latest message preview
Topic Hz 측정
최근 message_count 측정
last_received_at 저장
age_sec 계산
is_stale 계산
status(active / stale / never_received) 계산
Topic 이상 상태 alert 반환
MonitorStatus key-value preview 반환
MonitorStatus level 기반 warning / error / critical alert 반환
사라진 topic subscription grace cleanup
```

현재 `/ros/topics/hz` 응답에는 다음 필드가 포함된다.

```text
name
type
received
message_count
window_sec
hz
last_received_at
age_sec
is_stale
status
```

`received`는 “한 번이라도 메시지를 받은 적이 있는가”를 의미한다.  
현재 정상 수신 여부는 `status`, `is_stale`, `age_sec`로 판단한다.

현재 `/ros/alerts`는 Topic alert와 MonitorStatus alert를 우선 구현한다.  
Service waiting_server alert도 포함할 수 있다.
Node / Action alert는 이후 같은 구조로 확장한다.

---

## 7. 아직 구현하지 않은 기능

아래 기능은 현재 완료 기능으로 가정하지 않는다.

```text
Frontend 대시보드 매핑
Electron 연동
Node 모니터링
Action 모니터링
Service call 테스트
Service 응답 시간 측정
Action Goal / Feedback / Result 추적
WebSocket 실시간 push
/ros/overview
DB 저장
로그 저장
사용자 인증
JWT
```

단, 이후 확장을 고려하여 현재 구조를 깨지 않도록 작업한다.

---

## 8. Configuration Policy

백엔드 실행 환경과 ROS2 모니터링 정책은 분리한다.

`.env`의 역할:

```text
FastAPI / backend 실행 환경 설정
```

예:

```text
API_HOST
API_PORT
CORS_ORIGINS
MONITOR_CONFIG_PATH
```

`backend/config/monitor.yaml`의 역할:

```text
ROS2 모니터링 정책 설정
```

예:

```text
poll_interval_sec
stale_timeout_sec
hz_window_sec
topic include / exclude
topic auto_discover
supported_types
auto_subscribe_supported_types
```

원칙:

```text
.env와 monitor.yaml의 책임을 섞지 않는다.
.env에 ROS2 topic 감시 목록을 넣지 않는다.
frontend에 ROS2 모니터링 대상 목록을 넣지 않는다.
설정 파일이 없거나 값이 비어 있어도 safe default로 서버가 죽지 않아야 한다.
Gazebo/TurtleBot3 topic 이름을 Python 코드에 하드코딩하지 않는다.
```

---

## 9. ROS2 Topic 자동 발견 정책

이 프로젝트는 모니터링 로직에서
특정 ROS2 토픽 이름에 의존하면 안 된다.

예를 들어 아래 이름은 예시나 테스트에서는 사용할 수 있다.

```text
/scan
/odom
/cmd_vel
/imu
/joint_states
```

하지만 대시보드가 동작하기 위해
이 토픽 이름들이 반드시 필요하면 안 된다.

---

### 9.1 핵심 원칙

백엔드는 ROS2 Graph API를 사용해서
현재 존재하는 ROS2 토픽을 자동으로 발견해야 한다.

기본 흐름:

```text
1. ROS2 graph에서 현재 토픽 목록을 자동 조회한다.
2. 각 토픽의 이름과 메시지 타입을 확인한다.
3. include / exclude 필터 규칙을 적용한다.
4. 지원 가능한 메시지 타입이면 자동으로 subscription을 만든다.
5. 이미 subscription이 있으면 중복 생성하지 않는다.
6. subscription cache를 기반으로 latest / hz / stale / alerts를 계산한다.
```

토픽 이름보다 메시지 타입을 우선한다.

예:

```text
/scan
/robot1/scan
/lidar/front/scan
```

위 이름들은 서로 다르지만,
메시지 타입이 `sensor_msgs/msg/LaserScan`이면
같은 preview builder로 처리할 수 있다.

따라서 깊은 모니터링은 고정된 토픽 이름이 아니라
메시지 타입을 기준으로 처리해야 한다.

---

### 9.2 YAML 설정의 역할

`monitor.yaml`은 사용자가 반드시 직접 감시할
토픽 이름을 적는 파일이 아니다.

피해야 할 방식:

```yaml
topics:
  watch:
    - /scan
    - /odom
    - /cmd_vel
```

이 방식은 토픽 이름을 YAML로 옮긴 것뿐이다.  
사용자가 토픽 이름을 미리 알아야 하므로
자동 모니터링 대시보드에 맞지 않는다.

권장 방식:

```yaml
monitor:
  poll_interval_sec: 1.0
  stale_timeout_sec: 3.0
  hz_window_sec: 5.0

topics:
  auto_discover: true

  exclude:
    - /parameter_events
    - /rosout
    - /tf
    - /tf_static
    - /clock

  auto_subscribe_supported_types: true

  supported_types:
    - sensor_msgs/msg/LaserScan
    - nav_msgs/msg/Odometry
    - sensor_msgs/msg/Imu
    - geometry_msgs/msg/Twist
    - geometry_msgs/msg/TwistStamped
    - sensor_msgs/msg/JointState
    - ros2_dashboard_interfaces/msg/MonitorStatus
```

의미:

```text
auto_discover
= ROS2 graph 기반 자동 토픽 발견을 사용한다.

exclude
= 시스템용 또는 노이즈가 많은 토픽을 제외한다.

auto_subscribe_supported_types
= 지원 가능한 메시지 타입이면 자동으로 구독한다.

supported_types
= 깊은 모니터링이 가능한 메시지 타입 목록이다.
```

`topics.watch`는 필수 설정으로 사용하지 않는다.  
필요하다면 로컬 테스트나 임시 디버깅용 legacy 옵션으로만 취급한다.

---

### 9.3 모니터링 단계 구분

토픽 모니터링은 두 단계로 나눈다.

#### 1. 가벼운 모니터링

실제 메시지를 구독하지 않고,
ROS2 graph 정보만으로 확인한다.

```text
토픽 이름
메시지 타입
publisher 수
subscriber 수
상태
상태 이유
```

#### 2. 깊은 모니터링

지원 가능한 메시지 타입에 대해서만
자동 subscription을 만들고 다음 정보를 수집한다.

```text
최신 메시지 preview
Hz
최근 메시지 수
마지막 수신 시간
마지막 수신 후 경과 시간
stale 상태
alert 상태
```

모든 토픽을 무조건 deep monitoring 하지 않는다.  
지원 가능한 메시지 타입만 deep monitoring 한다.

---

### 9.4 런타임 동작 방식

백엔드는 일정 주기로 ROS2 graph를 갱신해야 한다.

새 토픽이 생겼을 때:

```text
1. 다음 polling 시점에 새 토픽을 발견한다.
2. 토픽의 메시지 타입을 확인한다.
3. exclude 대상인지 확인한다.
4. 지원 가능한 타입이면 자동 subscription을 만든다.
5. latest / hz / stale / alert 수집을 시작한다.
```

토픽이 사라졌을 때:

```text
서버는 죽으면 안 된다.
기존 cache는 alert 판단에 사용할 수 있다.
상황에 따라 publisher_lost, waiting_publisher, stale, inactive 상태를 표시할 수 있다.
subscription 객체는 즉시 제거하지 않고 grace period 이후 정리한다.
topic이 다시 나타나면 disappeared 상태를 해제한다.
```

---

### 9.5 금지 사항

```text
정상 모니터링을 위해 사용자가 직접 토픽 이름을 입력해야 하는 구조 금지
Python 코드 안에 로봇 전용 토픽 이름 하드코딩 금지
/scan, /odom, /cmd_vel 등이 반드시 있어야 동작하는 구조 금지
subprocess로 ros2 topic list 호출 금지
ROS2 Graph API 대신 shell 명령어 결과 파싱 금지
```

토픽 조회는 rclpy Node의 graph 메서드를 사용한다.

```python
node.get_topic_names_and_types()
node.count_publishers(topic_name)
node.count_subscribers(topic_name)
```

실제 메시지 preview는 메시지 타입별 preview builder를 사용한다.

---

### 9.6 허용되는 예외

토픽 이름은 다음 상황에서는 사용할 수 있다.

```text
curl 테스트 예시
README 예시
로컬 개발 테스트
단위 테스트
개발 메모
선택적 사용자 필터
선택적 고정 대시보드 카드
```

하지만 핵심 모니터링 시스템은
토픽 이름을 설정 파일에 직접 적지 않아도 동작해야 한다.

---

## 10. Topic latest / hz / stale 기준

`latest`는 topic의 마지막 메시지 preview를 제공한다.  
전체 ROS message를 그대로 JSON으로 보내지 말고,
타입별 preview builder를 사용해 필요한 값만 제공한다.

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

`std_msgs/msg/String`처럼 정적 설명용으로 자주 쓰이는 타입은
preview builder가 있더라도 기본 자동 deep monitoring 대상에서
제외할 수 있다.

`hz`는 최근 window 기준 메시지 수신 빈도를 계산한다.

기준:

```text
message_count
= 최근 hz_window_sec 안에 들어온 메시지 수

hz
= message_count / hz_window_sec

last_received_at
= 마지막으로 메시지를 받은 시각

age_sec
= 현재 시각 - last_received_at

is_stale
= age_sec > stale_timeout_sec

status
= active / stale / never_received
```

`last_received_at`은 마지막 수신 시간이므로,
Gazebo나 장비가 꺼지면 더 이상 갱신되지 않는 것이 정상이다.

---

## 11. Alert 정책

`GET /ros/alerts`는 상태이상 알림을 반환한다.

현재는 Topic alert와 MonitorStatus alert를 우선 구현한다.  
이후 Node / Service / Action alert도 같은 구조로 확장한다.

공통 alert item 권장 필드:

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

필드 의미:

```text
id
= source:name:code 형태

level
= info / warning / error / critical

source
= topic / monitor_status / node / service / action

name
= 대상 이름

code
= alert 종류

message
= 프론트 표시용 짧은 설명

status
= 현재 상태 문자열

last_received_at
= 마지막 수신 시간, 없으면 null

age_sec
= 마지막 수신 후 경과 시간, 없으면 null

detected_at
= alert 생성 시각
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
publisher_count > 0 and subscriber_count == 0 상태는
무조건 alert로 보지 않는다.

/scan, /odom처럼 데이터를 발행하지만
구독자가 없는 센서 topic은 정상일 수 있다.
```

MonitorStatus alert 기준:

```text
level == warning
→ monitor_status_warning

level == error
→ monitor_status_error

level == critical
→ monitor_status_critical

level == info / active / empty
→ alert로 보지 않는다.
```

MonitorStatus alert는 `device_name`, `node_name`, `values`를
추가로 포함할 수 있다. 백엔드는 `values`의 key 의미를
임의로 해석하지 않고 JSON으로 전달한다.

---

## 12. FastAPI + rclpy 실행 구조

FastAPI와 rclpy spin이 서로 막히면 안 된다.

권장 구조:

```text
FastAPI lifespan에서 Monitor Runtime 시작
rclpy Monitor Node 생성
rclpy spin은 background thread에서 실행
Monitor Node는 주기적으로 cache 갱신
FastAPI endpoint는 cache snapshot만 읽어서 반환
```

주의:

```text
FastAPI endpoint 안에서 직접 rclpy.spin() 하지 않는다.
endpoint 호출 때마다 ROS2 노드를 새로 만들지 않는다.
공유 데이터 접근 시 Lock을 사용한다.
종료 시 destroy_node()와 rclpy.shutdown()을 처리한다.
Context를 직접 생성/전달하지 않는다.
Executor를 직접 제어하지 않는다.
rclpy private/internal 속성을 사용하지 않는다.
```

---

## 13. ROS2 CLI subprocess 금지

대시보드 내부 구현에서 ROS2 CLI를 subprocess로 실행하지 않는다.

금지 예시:

```python
subprocess.run(["ros2", "topic", "list"])
subprocess.run(["ros2", "node", "list"])
subprocess.run(["ros2", "service", "list"])
subprocess.run(["ros2", "action", "list"])
```

이유:

```text
CLI 실행 비용이 큼
문자열 파싱이 필요함
실시간 모니터링에 약함
에러 처리와 확장이 어려움
ROS2 내부 상태를 직접 다루는 구조가 아님
```

반드시 rclpy Graph API를 우선 사용한다.

예시:

```python
node.get_node_names()
node.get_topic_names_and_types()
node.get_service_names_and_types()
node.count_publishers(topic_name)
node.count_subscribers(topic_name)
```

---

## 14. 응답 형식 기준

응답 key를 임의로 바꾸지 않는다.  
기존 API를 삭제하거나 응답 wrapper를 대규모 변경하지 않는다.

기본 wrapper:

```json
{
  "success": true,
  "data": {},
  "message": "..."
}
```

목록 API는 필요하면 `meta`를 포함한다.

`GET /health` 예시:

```json
{
  "success": true,
  "data": {
    "status": "running"
  },
  "message": "Backend is running"
}
```

`GET /ros/topics` 예시:

```json
{
  "success": true,
  "data": [
    {
      "name": "/cmd_vel",
      "types": ["geometry_msgs/msg/TwistStamped"],
      "publisher_count": 1,
      "subscriber_count": 1,
      "status": "active",
      "reason": "publisher and subscriber are available",
      "supported_type": true,
      "deep_monitoring": true
    }
  ],
  "meta": {
    "count": 1,
    "last_updated": 1783400000.0
  },
  "message": "ROS2 topics fetched successfully"
}
```

---

## 15. 환경 설정 기준

FastAPI/rclpy 실행 전 ROS2 환경이 잡혀 있어야 한다.

기본 로컬 테스트 환경:

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
export ROS_DOMAIN_ID=99
export ROS_LOCALHOST_ONLY=1
```

`ROS_LOCALHOST_ONLY=1`은 로컬 테스트용이다.  
다른 PC나 회사 장비의 ROS2 노드까지 봐야 하면 `0`으로 바꿔야 한다.

하드코딩하지 말 것:

```text
API URL
포트
ROS_DOMAIN_ID
실행 경로
도메인
비밀값
```

필요하면 `.env` 또는 설정 파일을 사용한다.

`.bashrc`에 프로젝트별 `source install/setup.bash`를 넣지 않는다.  
`source install/setup.bash`는 해당 workspace 안에서만 직접 실행한다.

---

## 16. Backend 작업 명령

Backend 명령은 반드시 `backend/`에서 실행한다.

```bash
cd ~/rang/ros2_dashboard/backend

source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash
```

FastAPI 실행 예시:

```bash
cd ~/rang/ros2_dashboard/backend

source /opt/ros/jazzy/setup.bash
source install/setup.bash

export TURTLEBOT3_MODEL=burger
export ROS_DOMAIN_ID=99
export ROS_LOCALHOST_ONLY=1

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

API 확인:

```bash
curl http://127.0.0.1:8000/health

curl http://127.0.0.1:8000/ros/topics \
  | python3 -m json.tool

curl "http://127.0.0.1:8000/ros/topics/hz?name=/scan" \
  | python3 -m json.tool

curl "http://127.0.0.1:8000/ros/alerts" \
  | python3 -m json.tool
```

---

## 17. Frontend 작업 명령

Frontend 명령은 `frontend/`에서 실행한다.

```bash
cd ~/rang/ros2_dashboard/frontend
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

주의:

```text
Node.js 20 이상 사용
package.json이 있는 frontend 폴더에서 npm 명령 실행
```

Frontend 수정은 명시적으로 요청받았을 때만 한다.

---

## 18. 테스트 기준

Backend 변경 후 가능한 경우 아래를 확인한다.

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
colcon test
source install/setup.bash
```

Frontend 변경 후 가능한 경우 아래를 확인한다.

```bash
cd ~/rang/ros2_dashboard/frontend
npm run lint
npm run build
```

테스트를 못 돌렸으면
무엇을 못 돌렸는지 이유를 명확히 말한다.

---

## 19. TurtleBot3 + Gazebo 사용 기준

TurtleBot3 + Gazebo는 프로젝트 본체가 아니다.  
모니터링 대상용 ROS2 더미 환경이다.

목적:

```text
실제 장비 없이 ROS2 Node / Topic / Service를 발생시킨다.
대시보드가 수집할 데이터를 만든다.
```

예상 Topic 예:

```text
/clock
/cmd_vel
/imu
/joint_states
/odom
/parameter_events
/robot_description
/rosout
/scan
/tf
/tf_static
```

정확한 목록은 launch 구성에 따라 달라질 수 있으므로
코드나 필수 YAML 값으로 고정하지 않는다.  
반드시 실제 ROS2 graph에서 조회한다.

---

## 20. 코딩 스타일

Python:

```text
패키지명, 모듈명: snake_case
rclpy 기반 구현 우선
package.xml과 setup.py 의존성 동기화
thread-safe cache 접근 시 Lock 사용
```

React:

```text
컴포넌트: PascalCase
hook: use... 형식
변수/함수: camelCase
ES module 사용
```

CSS:

```text
관련 React 파일 가까이에 둔다.
전역 스타일은 필요할 때만 사용한다.
```

---

## 21. Codex 작업 제한

Codex는 다음을 지켜야 한다.

```text
기존 UI/UX를 임의로 변경하지 않는다.
기존 변수명, 라우트명, 응답 key를 임의로 변경하지 않는다.
기존 파일/폴더 구조를 함부로 변경하지 않는다.
필요 없는 새 폴더나 새 구조를 만들지 않는다.
기존 로직을 삭제하지 않는다.
필요한 기능만 추가하거나 분기한다.
DB 스키마를 추가하거나 변경하지 않는다.
인증/JWT를 추가하지 않는다.
외부 라이브러리를 임의로 추가하지 않는다.
rclpy를 pip로 설치하지 않는다.
생성물 폴더를 직접 수정하지 않는다.
```

허용된 Python 패키지:

```text
fastapi
uvicorn
python-dotenv
ROS2 Jazzy 환경에 포함된 rclpy 및 ROS2 표준 패키지
```

새 라이브러리가 필요하면 먼저 이유를 설명하고 사용자 확인을 받아야 한다.

---

## 22. Codex 응답 방식

전체 코드를 길게 출력하지 않는다.

항상 아래 형식으로 답한다.

```text
수정 파일 목록
핵심 diff
실행 명령
검증 방법
주의할 점
```

코드를 보여줄 때도 전체 파일 덤프를 피하고
수정된 부분 중심으로 보여준다.

불확실한 부분은 확실한 것처럼 말하지 않는다.  
실행하지 못한 검증은 실행하지 못했다고 말한다.

---

## 23. 현재 작업 판단 기준

사용자가 별도 지시하지 않으면,
현재 기본 작업은 아래 흐름을 기준으로 판단한다.

```text
1. Topic 자동 발견
2. 지원 타입 자동 deep monitoring
3. Topic latest / hz / stale / alerts 안정화
4. 이후 Node / Service / Action 모니터링 확장
5. 마지막에 Frontend / Electron 매핑
```

현재 가장 중요한 방향:

```text
하드코딩된 토픽 이름 기준이 아니라
ROS2 Graph API 자동 발견
+
메시지 타입 기준 자동 subscribe
+
기존 latest / hz / alerts cache 재사용
```
