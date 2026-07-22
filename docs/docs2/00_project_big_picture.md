# 프로젝트 개요: ROS2 Communication Monitor Dashboard

> 라인 번호는 2026-07-21 실제 코드 기준이다. `L16`처럼 적힌 값은 해당 파일에서 기능이 시작되는 줄이다.

## 1. 이 프로젝트가 필요한 이유

ROS2 시스템에는 여러 Node가 Topic, Service, Action으로 연결됩니다. 규모가 커지면
이름 목록만으로는 어떤 통신이 정상이고 어디에서 데이터가 끊겼는지 알기 어렵습니다.
이 프로젝트는 현재 통신 구조와 상태를 Backend가 모아 React 화면에 보여주는
읽기 중심 모니터링 대시보드이며, 추가로 Interface Lab을 통해 ROS2 인터페이스를
동적으로 관리하고 로봇과 상호작용할 수 있습니다.

## 2. 전체 데이터 흐름

로봇이나 시뮬레이터의 ROS2 상태를 Python Backend가 관찰하고, FastAPI가 그 결과를
웹 API로 공개하며, React가 API를 읽어 화면을 만듭니다. Interface Lab은 사용자의
인터페이스 업로드/작성을 처리하고 ROS2 실행 환경에 이를 적용합니다.

### 모니터링 흐름
```text
ROS2 Node/Topic/Service/Action 발생
  — 실제 ROS2 실행 환경

→ rclpy Node가 ROS2 Graph와 메시지 관찰
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py

→ 네 Runtime이 최근 상태를 메모리에 저장
  — ros_monitor.py와 topic/service/action/node runtime cache

→ FastAPI가 REST와 WebSocket으로 공개
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/

→ React hook이 데이터를 가져와 화면에 전달
  — frontend/src/hooks/
```

### 사용자 실행 흐름 (Interface Lab)
```text
Interface 등록/업로드 (manual, single, package)
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py

→ build/apply (파일 저장/삭제 시 interface_lab/management/manual_interfaces.py가 CMakeLists.txt·package.xml 재생성, interface_lab/apply/runtime.py가 colcon build 실행)
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py

→ import check 및 registry 갱신

→ Service Call / Action Goal / Topic Receive
  — 관련 Runtime 실행 (backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py 등)

→ history 및 결과 UI 반영
```

ROS2의 현재 이름과 연결 관계를 코드로 묻는 기능을 **Graph API**라고 합니다.
Backend는 ROS2 CLI 출력을 분석하지 않고 rclpy Graph API를 사용합니다. Frontend와
Electron은 ROS2에 직접 접근하지 않습니다.

```text
React/Electron → FastAPI → Python rclpy → ROS2
```

### 코드 위치로 보는 큰 그림

| 단계 | 사용자가 보는 의미 | 코드 위치 |
|---|---|---|
| FastAPI app 시작 | Backend 서버가 켜지고 router를 등록한다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L21, L30, L40-L45 |
| RosMonitor 시작 | rclpy Node와 spin thread를 만들고 runtime을 살린다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L74 |
| Graph 주기 갱신 | Topic/Service/Action/Node runtime cache를 최신화한다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L531 |
| Monitoring REST | 화면이 현재 snapshot을 요청한다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L16-L93 |
| Interface 등록 | 사용자가 `.msg/.srv/.action` 또는 package를 등록한다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L40-L367 |
| Interface 적용 | 등록된 interface를 build/import 가능한 상태로 만든다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L25-L85 |
| 명시 실행 | 사용자가 Topic/Service/Action 실행 버튼을 누른다 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L14-L154, `service_execution.py` L14-L86, `action_execution.py` L14-L94 |
| Frontend 표시 | React hook/page/component가 JSON을 화면 상태로 바꾼다 | `frontend/src/App.jsx` L20, `frontend/src/api/rosApi.js` L1, `frontend/src/hooks/` |

처음 코드를 읽을 때는 `main.py`에서 모든 기능을 찾으려고 하면 길을 잃기 쉽다. `main.py`는 app을 조립하고 router를 붙이는 곳이며, 실제 endpoint 구현은 `routers/` 아래에 있다. Router는 다시 `RosMonitor`나 `interface_lab/` helper/runtime으로 일을 넘긴다.

## 3. Backend가 먼저 모으고 API가 읽는 이유

웹 요청이 올 때마다 ROS2 전체를 다시 조사하면 응답 시간과 수집 시점이 불안정해질
수 있습니다. 그래서 Backend의 Runtime이 최근 결과를 **cache(캐시)**, 즉 메모리에
보관한 최신 상태로 유지합니다. API가 읽을 수 있도록 cache를 복사한 한 시점의
결과를 **snapshot(스냅샷)**이라고 합니다.

```text
FastAPI 시작 시 RosMonitor 시작
  — main.py lifespan

→ timer가 Runtime cache 반복 갱신
  — ros_monitor.py

→ REST가 상세 snapshot 반환
  — routers/monitoring.py 및 routers/interface_*.py

→ WebSocket이 경량 요약 snapshot 전송
  — routers/monitoring.py
```

라인 기준으로 풀면 다음과 같다.

```text
main.py L21 lifespan
→ ros_monitor.py L74 RosMonitor.start()
→ ros_monitor.py L531 _update_graph()
→ topic/runtime.py L120 TopicRuntime.update()
→ service/runtime.py L86 ServiceRuntime.update()
→ action/runtime.py L84 ActionRuntime.update()
→ node/runtime.py L69 NodeRuntime.update()
→ routers/monitoring.py L16-L93 REST/WebSocket이 snapshot 읽기
```

여기서 중요한 점은 REST 요청이 Graph 갱신의 방아쇠가 아니라는 것이다. Graph 갱신은 Backend 내부 timer가 하고, REST는 이미 만들어진 snapshot을 읽는다.

REST 요청이 ROS2 Graph 갱신을 시작하는 것은 아닙니다. Runtime은 background에서
독립적으로 갱신되고 REST는 가장 최근에 완료된 값을 읽습니다.

## 4. REST와 WebSocket의 역할

Frontend가 정해진 간격마다 REST API를 다시 호출하는 방식을 **polling(폴링)**이라고
합니다. 목록과 상세 화면의 기준 데이터는 REST polling으로 가져옵니다. WebSocket은
연결 후 Backend가 1초마다 count와 Alert 같은 가벼운 요약을 보내는 보조 채널입니다.

| 구분 | 역할 | 코드 위치 |
|---|---|---|
| REST | 목록, latest, Hz, 상세 상태, Interface Lab 관리 및 실행 | `routers/` |
| WebSocket | 연결 상태와 경량 요약 | `routers/monitoring.py` |

WebSocket은 raw Topic 메시지를 지속 전송하지 않으며 REST table 데이터를 대체하지
않습니다. Frontend 1·3·5초 polling, Backend Graph 갱신 주기, WebSocket 1초 전송
주기는 서로 다릅니다.

## 5. 폴더의 역할

- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py`: FastAPI app 조립, lifespan, router 등록
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/`: REST/WebSocket endpoint
-  Endpoint란 무엇인가? 프론트가 요청을 보내는 백엔드의 특정 주소와 처리 함수
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/`: Interface Lab management/apply/execution/common
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic|service|action|node/`: ROS2 자동 모니터링 runtime
- `backend/config/`: 모니터링 주기, filter, allowlist 및 Interface registry 설정
- `frontend/src/hooks/`: API polling과 선택 상태
- `frontend/src/pages/`: 화면별 filter와 배치 (InterfaceLabPage 포함)
- `frontend/src/components/`: 표, 상세 패널, 그래프 UI 및 동적 Form

## 6. 전체 흐름 한 문장

rclpy Runtime이 ROS2 상태를 cache로 만들고 FastAPI가 snapshot을 공개하면 React가
이를 읽어 Topic, Service, Action, Node, Alert와 통신 구조를 표시하며, 사용자는 Interface Lab을 통해 인터페이스를 동적으로 등록하고 상호작용합니다.

## 초보자가 자주 틀리는 부분

- FastAPI가 ROS2를 직접 대체하는 것이 아니라 rclpy Node가 ROS2와 통신합니다.
- REST 요청마다 Graph를 새로 조사하지 않습니다.
- WebSocket 연결 성공이 모든 ROS2 통신의 정상 상태를 뜻하지 않습니다.
- Interface 등록 후 빌드/적용 과정 없이 즉시 사용할 수 없습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. 데이터 방향은 ROS2 ↔ rclpy Backend ↔ FastAPI ↔ React입니다.
2. Runtime이 cache를 갱신하고 REST/WebSocket은 목적에 맞는 snapshot을 읽으며, Interface Lab은 사용자 인터페이스 관리와 상호작용을 담당합니다.
3. Frontend는 ROS2에 직접 접근하지 않으며 Backend API가 유일한 연결 지점입니다.
