# ROS2 Dashboard 큰 그림

## 이 프로젝트는 무엇인가

`ros2_dashboard`는 현재 ROS2 시스템의 Node, Topic, Service, Action을 관찰하고, 등록한 Interface로 통신을 시험하는 웹 대시보드다.

프로젝트에는 성격이 다른 두 경로가 있다.

| 경로 | 목적 | 동작 원칙 |
|---|---|---|
| Monitoring | 현재 ROS2 Graph와 통신 상태 관찰 | 자동 발견하고 읽기 중심으로 동작 |
| Interface Lab | 등록한 Interface로 통신 시험 | 사용자가 누른 경우에만 Publish, Receive, Call, Goal 실행 |

Monitoring이 장비를 임의로 제어하지 않는 것이 중요하다. Service Call과 Action Goal처럼 영향을 줄 수 있는 동작은 Interface Lab에서 사용자가 명시적으로 실행한다.

## 전체 구성

```text
ROS2 시스템
  ↓ rclpy Graph API와 Subscription
Python Runtime
  ↓ cache snapshot
FastAPI REST / WebSocket
  ↓
Vite + React 웹앱
```

- Backend는 Python, FastAPI, `rclpy`로 구성된다.
- Frontend는 Vite + React 기반 순수 웹앱이다.
- React Flow는 관계를 분석하지 않는다. Frontend가 만든 `nodes`와 `edges`를 화면에 그린다.

## YAML 등록 Interface가 연결되는 곳

Interface Lab에서 등록되고 Python import까지 가능한 타입은 단순 실행 후보에만 쓰이지 않는다.

```text
등록 msg + Graph Topic 타입 exact match
→ 주요 Topic
→ 자동 Subscription
→ latest / Hz / missing / stale 감시

등록 srv + Graph Service 타입 exact match
→ 주요 Service

등록 action + Graph Action 타입 exact match
→ 주요 Action

위 통신에 실제로 참여하는 Node
→ 주요 Node
```

이 판정은 이름이 아니라 ROS2의 전체 타입 문자열이 정확히 같은지 확인한다. 예를 들어 `my_interfaces/msg/Status`와 `other_interfaces/msg/Status`는 서로 다른 타입이다.

Topics, Services, Actions, Nodes뿐 아니라 Overview와 Visualization도 같은 Backend 신호와 공통 Frontend 필터를 사용한다. 타입이 등록됐다는 이유만으로 관계없는 Node까지 주요 항목이 되지는 않는다.

## Graph 상태를 기억하는 이유

ROS2 Graph는 현재 보이는 통신 주체만 알려준다. Backend는 한 번 본 리소스를 기억해 다음 세 상태를 구분한다.

```text
현재 Graph에 있음
→ 정상, 사용 가능 또는 대기

이전에 있었지만 지금 없음
→ disconnected, 종료 감지 또는 연결 끊김

Backend 시작 후 한 번도 본 적 없음
→ 미발견 또는 대기, 중립
```

Graph 정보만으로 프로세스가 정상 종료했는지 비정상 종료했는지는 알 수 없다. 따라서 UI도 “비정상 종료”라고 단정하지 않고 “종료 감지”, “연결 끊김”, “현재 사용 불가”로 표현한다.

## Alert가 보이는 방식

현재 장애는 `active`로 계속 표시되고 현재 warning/error 집계에 들어간다. 해결되면 즉시 `resolved`가 되어 현재 장애 집계에서 빠지지만, 사용자가 확인할 수 있도록 `resolved_at`부터 60초 동안 목록에 남는다.

같은 장애가 60초 안에 재발하면 새 항목을 계속 만들지 않고 기존 항목을 다시 `active`로 전환한다. 이 정보는 메모리 cache이므로 Backend를 재시작하면 초기화된다.

자세한 생명주기는 [07_alert_flow.md](07_alert_flow.md)를 참고한다.

## 어디부터 읽으면 되는가

1. 용어와 상태: [01_core_concepts.md](01_core_concepts.md)
2. Backend 전체 흐름: [02_backend_flow.md](02_backend_flow.md)
3. Topic부터 Node까지: `03`~`06`
4. Alert와 화면: `07`~`10`
5. 코드 위치 찾기: [11_code_trace_index.md](11_code_trace_index.md)
6. Interface Lab: [12_interface_lab_flow.md](12_interface_lab_flow.md)

문제가 생기면 먼저 `/health`와 각 `/ros/*` 응답을 확인한다. Backend 응답이 정상인데 화면만 다르면 Frontend 매핑을, Backend 응답부터 다르면 해당 Runtime과 설정을 확인하는 순서가 가장 빠르다.
