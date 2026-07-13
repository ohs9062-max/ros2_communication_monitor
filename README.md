# ROS2 Communication Monitor Dashboard 프로젝트 개요

## Server
 python3 -m uvicorn ros2_dashboard_backend.main:app --host 127.0.0.1 --port 8000 --reload
 npm run dev

  ##GAzebo
  source /opt/ros/jazzy/setup.bash
  export TURTLEBOT3_MODEL=burger
  ros2 launch turtlebot3_gazebo \
    turtlebot3_world.launch.py
 ros2 run turtlebot3_teleop teleop_keyboard

##  Nav2
 source /opt/ros/jazzy/setup.bash
 export TURTLEBOT3_MODEL=burger
 ros2 launch turtlebot3_navigation2 \
 navigation2.launch.py \
 use_sim_time:=True

## venv
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
source install/setup.bash

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload

## 

## build
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
colcon build --symlink-install
source install/setup.bash

deactivate

## 1. 프로젝트 한 줄 정의

ROS2에서 실행 중인 Node, Topic, Service, Action의 통신 상태를 수집하고,
Electron + React 화면에서 실시간으로 확인할 수 있는 데스크톱 모니터링 대시보드를 만든다.

---

## 2. 프로젝트 목적

ROS2 시스템은 여러 Node가 Topic, Service, Action으로 통신한다.
문제가 생기면 보통 터미널에서 아래 명령어로 상태를 확인한다.

```bash
ros2 node list
ros2 topic list
ros2 service list
ros2 action list
ros2 topic hz /topic_name
```

하지만 터미널 명령어만으로는 전체 통신 상태를 한눈에 보기 어렵다.

이 프로젝트의 목적은 다음과 같다.

```text
ROS2 통신 상태를 웹 기반 대시보드에서 한눈에 확인한다.
Node / Topic / Service / Action 상태를 실시간으로 감시한다.
통신 끊김, 응답 지연, Timeout, 비정상 상태를 빠르게 찾는다.
실제 장비 없이도 TurtleBot3 + Gazebo 시뮬레이션으로 테스트한다.
```

즉, 이 프로젝트는 단순 CRUD 게시판이 아니라
ROS2 시스템 디버깅과 운영 확인을 위한 모니터링 도구이다.

---

## 3. 왜 만드는가

ROS2 기반 장비나 로봇 시스템에서 문제가 생기면 원인을 찾기 어렵다.

예를 들어 아래와 같은 문제가 발생할 수 있다.

```text
Node가 실행 중인지 알기 어렵다.
Topic이 존재하지만 실제 메시지가 들어오는지 알기 어렵다.
Service Server가 살아 있는지 알기 어렵다.
Action Server가 Goal을 받을 수 있는지 알기 어렵다.
응답 시간이 느린지 확인하기 어렵다.
Timeout이나 통신 끊김을 바로 보기 어렵다.
```

대시보드가 있으면 아래처럼 판단할 수 있다.

```text
어떤 Node가 살아 있는가?
어떤 Topic이 발행 중인가?
Publisher / Subscriber가 붙어 있는가?
Service 응답이 오는가?
Action Goal / Feedback / Result 흐름이 정상인가?
최근 메시지 수신 시간이 언제인가?
비정상 상태가 발생했는가?
```

결과적으로 문제 발생 지점을 빠르게 찾기 위한 도구가 된다.

---

## 4. 사용하는 기술 스택

```text
ROS2: Jazzy
OS: Ubuntu 24.04
ROS2 상태 수집: Python / rclpy
Backend API: FastAPI
Frontend UI: React
Desktop App: Electron
실시간 통신: REST API 우선, 이후 WebSocket 추가 가능
테스트용 ROS2 환경: TurtleBot3 + Gazebo
```

역할은 아래처럼 나눈다.

```text
ROS2 + Python
= ROS2 Graph와 통신 상태 수집

FastAPI
= 수집한 ROS2 상태를 REST API 또는 WebSocket으로 제공

React
= 대시보드 화면 구성

Electron
= React 화면을 데스크톱 앱으로 실행

TurtleBot3 + Gazebo
= 실제 장비 대신 사용하는 ROS2 더미 데이터 환경
```

---

## 5. 전체 시스템 구조

```text
TurtleBot3 + Gazebo
        ↓
ROS2 Nodes / Topics / Services / Actions
        ↓
Python rclpy Monitor Node
        ↓
FastAPI Backend
        ↓
REST API / WebSocket
        ↓
Electron + React Dashboard
```

세부 의미는 다음과 같다.

```text
TurtleBot3 + Gazebo
= 가상 로봇 시뮬레이션 환경
= 실제 ROS2 통신 데이터를 발생시키는 더미 시스템

ROS2 Monitor Node
= rclpy로 ROS2 상태를 수집하는 Python Node

FastAPI Backend
= React 화면에 필요한 데이터를 JSON으로 제공

Electron + React
= 사용자가 보는 데스크톱 대시보드 화면
```

---

## 6. 중요한 방향성

이 프로젝트는 단순히 터미널 명령어를 실행해서 결과를 가져오는 방식으로 만들지 않는다.

피해야 할 방식:

```python
import subprocess

result = subprocess.run(
    ["ros2", "node", "list"],
    capture_output=True,
    text=True,
)
```

이 방식은 쉽지만 한계가 있다.

```text
CLI 명령어 실행 비용이 크다.
출력 문자열을 파싱해야 한다.
실시간 모니터링에 약하다.
ROS2 내부 상태를 직접 다루는 구조가 아니다.
에러 처리와 확장이 불편하다.
```

권장 방향은 rclpy Graph API 기반이다.

예시 개념:

```python
nodes = node.get_node_names()
topics = node.get_topic_names_and_types()
services = node.get_service_names_and_types()
```

즉, Python ROS2 Node가 직접 ROS2 graph 정보를 조회하고,
FastAPI가 그 결과를 API로 제공하는 구조를 우선한다.

---

## 7. MVP 정의

MVP는 Minimum Viable Product의 약자이다.

뜻:

```text
최소 기능 제품
```

이번 프로젝트의 MVP는 아래 기능이다.

```text
TurtleBot3 + Gazebo를 실행한다.
ROS2에서 Node / Topic / Service / Action 목록을 수집한다.
FastAPI에서 /ros/status API로 JSON을 반환한다.
React 화면에서 해당 목록을 표로 표시한다.
Electron에서 React 화면을 데스크톱 앱처럼 실행한다.
```

MVP에서 아직 하지 않아도 되는 것:

```text
Topic Hz 측정
Service 응답 시간 측정
Action Feedback / Result 상세 추적
WebSocket 실시간 push
경고 알림
로그 저장
DB 저장
사용자 인증
```

MVP의 목표는 완성형 기능이 아니라,
ROS2 상태가 화면에 실제로 표시되는 첫 번째 성공 버전을 만드는 것이다.

---

## 8. MVP 기능 범위

### 8.1 Backend MVP

FastAPI에서 아래 API를 제공한다.

```text
GET /ros/status
```

응답 예시:

```json
{
  "nodes": [
    "/robot_state_publisher",
    "/turtlebot3_node"
  ],
  "topics": [
    {
      "name": "/cmd_vel",
      "types": ["geometry_msgs/msg/Twist"]
    },
    {
      "name": "/odom",
      "types": ["nav_msgs/msg/Odometry"]
    },
    {
      "name": "/scan",
      "types": ["sensor_msgs/msg/LaserScan"]
    }
  ],
  "services": [
    {
      "name": "/reset_simulation",
      "types": ["std_srvs/srv/Empty"]
    }
  ],
  "actions": []
}
```

### 8.2 Frontend MVP

React 화면에서 아래 섹션을 표시한다.

```text
Node 목록
Topic 목록
Service 목록
Action 목록
```

처음 화면은 단순 표 형태로 충분하다.

예시:

```text
[Nodes]
/robot_state_publisher
/turtlebot3_node

[Topics]
/cmd_vel     geometry_msgs/msg/Twist
/odom        nav_msgs/msg/Odometry
/scan        sensor_msgs/msg/LaserScan

[Services]
/reset_simulation   std_srvs/srv/Empty

[Actions]
없음
```

### 8.3 Electron MVP

Electron은 React 화면을 데스크톱 앱으로 띄운다.

초기 개발 단계에서는 FastAPI와 Electron을 따로 실행해도 된다.

```text
터미널 1: FastAPI 실행
터미널 2: React / Electron 실행
```

처음부터 Electron에서 FastAPI를 child process로 실행하는 구조는
필수 기능이 아니다.

---

## 9. 개발 단계

### 1단계: TurtleBot3 + Gazebo 실행 확인

목표:

```text
Gazebo에서 TurtleBot3 시뮬레이션을 실행한다.
ROS2 Topic / Node가 실제로 생성되는지 확인한다.
```

확인 예시:

```bash
ros2 node list
ros2 topic list
```

주의:

```text
이 명령어는 개발자가 확인하는 용도이다.
대시보드 내부 구현에서 subprocess로 이 명령어를 실행하는 방식은 지양한다.
```

---

### 2단계: rclpy로 ROS2 상태 수집

목표:

```text
Python rclpy Node에서 ROS2 graph 정보를 직접 조회한다.
Node 목록을 가져온다.
Topic 목록과 타입을 가져온다.
Service 목록과 타입을 가져온다.
Action 목록은 가능한 범위에서 수집한다.
```

핵심 방향:

```text
CLI 명령어 실행 X
rclpy Graph API 사용 O
```

---

### 3단계: FastAPI API 연결

목표:

```text
FastAPI에서 /ros/status API를 만든다.
API 호출 시 rclpy Monitor Node가 수집한 상태를 JSON으로 반환한다.
```

주의:

```text
FastAPI 실행 전에 ROS2 환경 source가 필요하다.
ROS_DOMAIN_ID가 모니터링 대상과 같아야 한다.
```

실행 환경 예시:

```bash
source /opt/ros/jazzy/setup.bash
source install/setup.bash
export ROS_DOMAIN_ID=99
python3 -m uvicorn main:app --reload --port 8000
```

---

### 4단계: React 화면 표시

목표:

```text
React에서 GET /ros/status를 호출한다.
응답받은 nodes, topics, services, actions를 화면에 표시한다.
```

초기에는 1~3초 간격 polling 방식으로 충분하다.

```text
REST API polling
= 일정 시간마다 GET /ros/status 요청
```

---

### 5단계: Electron 연결

목표:

```text
Electron에서 React 화면을 데스크톱 앱으로 실행한다.
```

초기에는 FastAPI 서버를 별도 터미널에서 실행한다.

나중에 필요하면 Electron main process에서 FastAPI를 실행하는 방식을 검토한다.

---

## 10. 이후 확장 기능

MVP 이후 추가할 수 있는 기능은 아래와 같다.

### 10.1 Topic 모니터링 강화

```text
Publisher 수 표시
Subscriber 수 표시
마지막 메시지 수신 시간 표시
Topic Hz 측정
일정 시간 메시지 미수신 시 경고 표시
```

예시 상태:

```text
/scan     10Hz     OK
/odom     30Hz     OK
/cmd_vel  0Hz      No message
```

---

### 10.2 Service 모니터링 강화

```text
Service Server 존재 여부 확인
Service 응답 시간 측정
Timeout 표시
호출 실패 여부 표시
```

예시 상태:

```text
/reset_simulation   available   18ms
/cmd_service        timeout     3000ms
```

---

### 10.3 Action 모니터링 강화

```text
Action Server 존재 여부 확인
Goal 전송 가능 여부 확인
Feedback 수신 상태 표시
Result 성공/실패 표시
실행 시간 측정
취소 상태 표시
```

예시 상태:

```text
/CanControl
Goal accepted
Feedback received
Result success=false
message=cansend failed
```

---

### 10.4 Health Topic 구조 추가

실무형 모니터링을 위해 각 Node가 자기 상태를 직접 발행하는 구조를 추가할 수 있다.

예시 Topic:

```text
/node_health
/system_status
/can_status
```

예시 메시지:

```json
{
  "node_name": "gate_controller",
  "status": "OK",
  "last_update": "2026-07-07 15:20:00",
  "message": "CAN communication normal"
}
```

이 방식은 단순 목록 조회보다 더 정확한 상태 판단이 가능하다.

---

## 11. TurtleBot3 + Gazebo를 더미데이터로 쓰는 이유

이 프로젝트는 ROS2 통신 상태를 모니터링하는 도구이다.
따라서 모니터링할 ROS2 시스템이 필요하다.

실제 로봇이나 회사 장비가 없어도 TurtleBot3 + Gazebo를 사용하면
가상의 ROS2 시스템을 만들 수 있다.

TurtleBot3 + Gazebo 실행 시 생성될 수 있는 예시 Topic:

```text
/cmd_vel
/odom
/scan
/tf
/clock
/joint_states
/robot_description
```

정확한 목록은 실행 환경과 launch 파일에 따라 달라질 수 있다.
따라서 코드에 고정값으로 넣지 말고 실제 ROS2 graph에서 조회해야 한다.

TurtleBot3 + Gazebo의 역할:

```text
프로젝트 본체 X
모니터링 대상용 테스트 ROS2 환경 O
```

---

## 12. 주의사항

### 12.1 하드코딩 금지

아래 값은 코드에 하드코딩하지 않는다.

```text
API URL
포트
ROS_DOMAIN_ID
실행 경로
도메인
```

필요하면 `.env` 또는 설정값을 사용한다.

---

### 12.2 React에서 ROS2 직접 접근 금지

권장하지 않는 구조:

```text
React / Electron
→ ROS2 직접 접근
```

권장 구조:

```text
React / Electron
→ FastAPI
→ Python rclpy
→ ROS2
```

---

### 12.3 CLI subprocess 방식 지양

대시보드 내부 구현에서 아래 방식은 지양한다.

```text
subprocess로 ros2 node list 실행
subprocess로 ros2 topic list 실행
문자열 파싱으로 목록 생성
```

권장 방식:

```text
rclpy Graph API 기반 수집
필요 시 Topic / Service / Action 실제 통신 상태 검사
```

---

### 12.4 ROS2 환경 source 필요

FastAPI에서 rclpy를 사용하려면 실행 전에 ROS2 환경이 잡혀 있어야 한다.

```bash
source /opt/ros/jazzy/setup.bash
source install/setup.bash
export ROS_DOMAIN_ID=99
```

ROS_DOMAIN_ID가 다르면 대상 Node가 보이지 않을 수 있다.

---

## 13. 초기 폴더 구조 예시

실제 프로젝트 구조가 정해져 있다면 기존 구조를 우선한다.
새 구조를 강제로 만들지 않는다.

초기 예시:

```text
project-root/
├─ backend/
│  ├─ main.py
│  ├─ ros_monitor.py
│  └─ requirements.txt
│
├─ frontend/
│  ├─ package.json
│  ├─ electron/
│  └─ src/
│     ├─ App.jsx
│     └─ components/
│
└─ README.md
```

역할:

```text
backend/main.py
= FastAPI 진입점

backend/ros_monitor.py
= rclpy 기반 ROS2 상태 수집 로직

frontend/src/App.jsx
= React 메인 화면

frontend/electron/
= Electron main/preload 관련 파일
```

---

## 14. 우선 구현할 API 설계

### GET /ros/status

ROS2 전체 상태 요약을 반환한다.

응답 형태 예시:

```json
{
  "success": true,
  "data": {
    "nodes": [],
    "topics": [],
    "services": [],
    "actions": []
  },
  "message": "ROS2 status fetched successfully"
}
```

에러 응답 예시:

```json
{
  "success": false,
  "data": null,
  "message": "Failed to fetch ROS2 status"
}
```

프로젝트에 기존 sendSuccess / sendError 응답 규칙이 있다면 그 규칙을 유지한다.
응답 key를 임의로 변경하지 않는다.

---

## 15. 화면 구성 초안

초기 화면은 복잡한 디자인보다 상태 확인에 집중한다.

```text
상단
- ROS2 Communication Monitor Dashboard
- 마지막 갱신 시간
- 전체 상태 OK / Warning / Error

본문
- Node Status Table
- Topic Status Table
- Service Status Table
- Action Status Table
```

초기 표 컬럼 예시:

```text
Node Table
- node_name
- status

Topic Table
- topic_name
- type
- publisher_count
- subscriber_count

Service Table
- service_name
- type
- status

Action Table
- action_name
- type
- status
```

MVP에서는 publisher_count, subscriber_count, status가 불완전해도 된다.
가능한 범위부터 표시하고 이후 확장한다.

---

## 16. Codex 작업 지침

이 문서를 기준으로 작업한다.

필수 지침:

```text
기존 UI/UX를 임의로 변경하지 않는다.
기존 변수명, 라우트명, 응답 key를 임의로 변경하지 않는다.
기존 파일/폴더 구조를 함부로 변경하지 않는다.
필요 없는 새 폴더나 새 구조를 만들지 않는다.
외부 라이브러리는 임의로 추가하지 않는다.
URL, 포트, 도메인은 하드코딩하지 않는다.
.env 또는 기존 설정 방식을 우선한다.
기존 로직을 삭제하지 않고 필요한 기능만 추가하거나 분기한다.
전체 코드 출력은 하지 않는다.
수정 파일 목록과 핵심 diff만 보여준다.
```

---

## 17. 우선 작업 순서 요약

```text
1. TurtleBot3 + Gazebo 실행 환경 확인
2. rclpy로 ROS2 node/topic/service 목록 조회
3. FastAPI GET /ros/status 구현
4. React에서 /ros/status 호출
5. Electron에서 React 화면 실행
6. 1~3초 polling으로 상태 갱신
7. Topic publisher/subscriber 수 표시
8. Topic Hz와 마지막 수신 시간 표시
9. Service 응답 시간 측정
10. Action 상태 추적
11. WebSocket 실시간 갱신 추가 검토
12. Health Topic 기반 상태 보고 구조 검토
```

---

## 18. 최종 목표

최종적으로 만들고 싶은 것은 아래와 같다.

```text
ROS2 시스템에서 Node / Topic / Service / Action 상태를
터미널 명령어 없이 Electron + React 대시보드에서 확인하고,
통신 장애나 비정상 상태를 빠르게 찾을 수 있는 모니터링 도구
```

MVP의 성공 기준:

```text
TurtleBot3 + Gazebo 실행 후
대시보드에 실제 ROS2 Node / Topic / Service / Action 목록이 표시된다.
```

확장 성공 기준:

```text
Topic 수신 상태, Hz, Service 응답 시간, Action 상태,
비정상 상태 경고까지 대시보드에서 확인할 수 있다.
```
