# 프로젝트 개요: ROS2 Communication Monitor Dashboard

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

```text
ROS2 Node/Topic/Service/Action 발생
  — 실제 ROS2 실행 환경

→ rclpy Node가 ROS2 Graph와 메시지 관찰
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py L65-L77

→ Interface Lab이 사용자 정의 인터페이스 적용 및 관리
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_registry.py, backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_apply.py

→ 네 Runtime이 최근 상태를 메모리에 저장
  — ros_monitor.py L32-L57

→ FastAPI가 REST와 WebSocket으로 공개
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py L55-L163

→ React hook이 데이터를 가져와 화면에 전달
  — frontend/src/App.jsx, frontend/src/hooks/

→ Page가 Table/Detail/React Flow 렌더링
  — frontend/src/pages/, frontend/src/components/
```


ROS2의 현재 이름과 연결 관계를 코드로 묻는 기능을 **Graph API**라고 합니다.
Backend는 ROS2 CLI 출력을 분석하지 않고 rclpy Graph API를 사용합니다. Frontend와
Electron은 ROS2에 직접 접근하지 않습니다.

```text
React/Electron → FastAPI → Python rclpy → ROS2
```

## 3. Backend가 먼저 모으고 API가 읽는 이유

웹 요청이 올 때마다 ROS2 전체를 다시 조사하면 응답 시간과 수집 시점이 불안정해질
수 있습니다. 그래서 Backend의 Runtime이 최근 결과를 **cache(캐시)**, 즉 메모리에
보관한 최신 상태로 유지합니다. API가 읽을 수 있도록 cache를 복사한 한 시점의
결과를 **snapshot(스냅샷)**이라고 합니다.

```text
FastAPI 시작 시 RosMonitor 시작
  — main.py L21-L31, ros_monitor.py L59-L73

→ timer가 Runtime cache 반복 갱신
  — ros_monitor.py L66-L70, L304-L309

→ REST가 상세 snapshot 반환
  — main.py L54-L127

→ WebSocket이 경량 요약 snapshot 전송
  — main.py L130-L147, ros_monitor.py L117-L146
```

REST 요청이 ROS2 Graph 갱신을 시작하는 것은 아닙니다. Runtime은 background에서
독립적으로 갱신되고 REST는 가장 최근에 완료된 값을 읽습니다.

## 4. REST와 WebSocket의 역할

Frontend가 정해진 간격마다 REST API를 다시 호출하는 방식을 **polling(폴링)**이라고
합니다. 목록과 상세 화면의 기준 데이터는 REST polling으로 가져옵니다. WebSocket은
연결 후 Backend가 1초마다 count와 Alert 같은 가벼운 요약을 보내는 보조 채널입니다.

| 구분 | 역할 | 코드 위치 |
|---|---|---|
| REST | 목록, latest, Hz, 상세 상태 | `main.py` L54-L127 |
| WebSocket | 연결 상태와 경량 요약 | `main.py` L130-L147 |

WebSocket은 raw Topic 메시지를 지속 전송하지 않으며 REST table 데이터를 대체하지
않습니다. Frontend 1·3·5초 polling, Backend Graph 갱신 주기, WebSocket 1초 전송
주기는 서로 다릅니다.

## 5. 폴더의 역할

- `backend/src/ros2_dashboard_backend/`: ROS2 수집과 FastAPI 제공
- `backend/config/`: 모니터링 주기, filter, allowlist 설정
- `frontend/src/hooks/`: API polling과 선택 상태
- `frontend/src/pages/`: 화면별 filter와 배치
- `frontend/src/components/`: 표, 상세 패널, 그래프 UI

## 6. 전체 흐름 한 문장

rclpy Runtime이 ROS2 상태를 cache로 만들고 FastAPI가 snapshot을 공개하면 React가
이를 읽어 Topic, Service, Action, Node, Alert와 통신 구조를 표시합니다.

## 초보자가 자주 틀리는 부분

- FastAPI가 ROS2를 직접 대체하는 것이 아니라 rclpy Node가 ROS2와 통신합니다.
- REST 요청마다 Graph를 새로 조사하지 않습니다.
- WebSocket 연결 성공이 모든 ROS2 통신의 정상 상태를 뜻하지 않습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. 데이터 방향은 ROS2 → rclpy Backend → FastAPI → React입니다.
2. Runtime이 cache를 갱신하고 REST와 WebSocket은 목적에 맞는 snapshot을 읽습니다.
3. Frontend는 ROS2에 직접 접근하지 않으며 Backend API가 유일한 연결 지점입니다.
