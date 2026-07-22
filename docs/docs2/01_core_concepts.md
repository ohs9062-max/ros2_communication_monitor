# 핵심 개념

> 라인 번호는 2026-07-21 실제 코드 기준이다. 이 문서는 용어를 먼저 이해하고, 실제 구현 위치를 바로 찾아가기 위한 입구다.

## 1. ROS2 통신 요소

**Node**는 센서 읽기나 로봇 제어처럼 하나의 역할을 수행하는 ROS2 프로그램
단위입니다. 이 프로젝트는 Node 이름뿐 아니라 각 Node가 연결한 Topic, Service,
Action 관계도 수집합니다.

**Topic**은 데이터를 계속 발행하고 구독하는 통신 채널입니다.

**Service**는 client가 한 번 요청하고 server가 응답하는 통신입니다.

**Action**은 오래 걸리는 작업을 Goal, Feedback, Result로 나눈 통신입니다.

| 개념 | 이 프로젝트에서 저장/조회되는 내용 | 대표 코드 위치 |
|---|---|---|
| Node | Node 이름, namespace, 연결된 Topic/Service/Action 관계 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` L25, L69 |
| Topic | Topic 이름, type, publisher/subscriber 수, latest preview, Hz | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L41, L70, L120 |
| Service | Service 이름, type, server/client 수, 상태, active_check 결과 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L24, L54, L86 |
| Action | Action 이름, type, server/client 수, status/feedback/result 관찰 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L35, L70, L84 |

## 2. Interface Lab 관련 개념

Interface Lab은 ROS2 인터페이스를 동적으로 관리하고 로봇과 상호작용하는 핵심 기능입니다.

- **registry**: 등록된 모든 인터페이스의 메타데이터를 관리하는 저장소 (`interface_registry.yaml`).
- **full_type**: 패키지명을 포함한 ROS2 인터페이스의 고유 식별자 (예: `can_interfaces/action/CanControl`).
- **인터페이스 등록 방식**:
    - **manual_type**: 사용자가 수동으로 타입 정의.
    - **manual_definition**: 사용자가 직접 `.msg/.srv/.action` 정의.
    - **single_upload**: 단일 파일 업로드.
    - **package_upload**: 완전한 패키지 폴더 업로드.
- **build/apply**: `manual_definition`, `single_upload`, `package_upload` 방식으로 등록한 인터페이스 파일을 실제 ROS2 패키지 구조로 만들고 `colcon build`를 실행하는 과정입니다. CMakeLists.txt와 package.xml 재생성은 `interface_lab/management/manual_interfaces.py`가 담당하고, `interface_lab/apply/runtime.py`가 colcon build를 실행합니다. `manual_type`은 파일을 생성하지 않으므로 build가 필요 없습니다.
- **callable**: 서비스나 액션이 현재 로봇에서 호출 가능한지 여부 (스키마와 타입 일치 여부 확인).
- **exact match**: 이름뿐만 아니라 `full_type`까지 일치해야 정확한 호출이 가능함.

용어를 코드 흐름으로 보면 다음과 같다.

- `registry`: `backend/config/interface_registry.yaml`에 저장되는 등록 정보이며, 읽기 구현은 `interface_lab/management/registry.py` L374에서 시작한다.
- `full_type`: `패키지명/msg/타입명`, `패키지명/srv/타입명`, `패키지명/action/타입명` 형태의 전체 타입 이름이다. callable 판단에서 이름만 맞는지 보지 않고 full_type까지 맞는지 확인한다.
- `callable`: 등록되어 있고 import 가능하며 현재 ROS2 Graph에도 실행 대상이 존재한다는 뜻이다. Service는 `interface_lab/execution/service_call_runtime.py` L56, Action은 `interface_lab/execution/action_goal_runtime.py` L61, Topic Message는 `interface_lab/execution/topic_runtime.py` L80에서 판단한다.
- `schema`: 사용자가 form에 어떤 값을 넣어야 하는지 알려주는 필드 구조다. Topic Message schema는 `interface_lab/execution/topic_runtime.py` L64, 공통 schema helper는 `interface_lab/common/value_converter.py` L130에서 시작한다.

## 3. 모니터링 vs 실행 (Monitor vs Execute)

| 구분 | 모니터링 (Monitor) | 실행 (Execute) |
|---|---|---|
| 목적 | 시스템 상태 관찰 (Graph) | 사용자 요청 전송 (Lab) |
| 담당 | `RosMonitor` / `Runtime` | `Interface Lab` / `CallRuntime` |
| 동작 | 주기적 Graph 스캔, 구독 | 동적 API 호출, Goal 전송 |
| 데이터 | `snapshot` | `history`, `sent_to_server` |

## 4. 상태를 수집하는 구조

ROS2의 현재 이름과 연결 관계를 코드로 조회하는 기능이 **Graph API**입니다.
Runtime은 Graph API를 사용해 목록을 조사합니다.

```text
timer가 Runtime.update() 호출 (모니터링)
  — ros_monitor.py

→ Runtime이 Graph API로 통신 구조 조사
  — topic/runtime.py 등 각 runtime.py

→ 필요한 Topic subscription 생성 및 callback 실행
  — 메시지 도착 시 정보 저장
```

## 5. Runtime, cache, snapshot

**Runtime**은 서버가 실행되는 동안 특정 영역의 상태와 기능을 묶어 관리하는
객체입니다.

**cache**는 Runtime이 메모리에 보관하는 최신 결과이고, **snapshot**은 API가 안전하게
읽도록 cache를 복사한 한 시점의 값입니다.

**coordinator(조정자)**인 `RosMonitor`는 세부 로직을 직접 반복하지 않고 Runtime의
`update()`와 `snapshot()`을 호출합니다.

## 6. 동시에 실행되는 작업

**thread(스레드)**는 하나의 프로그램 안에서 별도로 진행되는 작업 흐름입니다.
FastAPI는 웹 요청을 처리하고 ROS2 spin thread는 timer와 subscription callback을
처리합니다.

두 실행 흐름이 같은 cache에 접근하므로 **Lock(락)**이 갱신 중인 데이터를 다른
쪽에서 읽지 못하게 잠시 보호합니다.

## 7. 전체 흐름 한 문장

ROS2 상태 모니터링을 위한 Runtime cache 갱신과, Interface Lab을 통한 동적 인터페이스 관리 및 서비스/액션 상호작용이 동시에 수행됩니다.

## 초보자가 자주 틀리는 부분

- `monitoring`은 관찰이다. 사용자의 Service Request나 Action Goal을 자동으로 보내지 않는다.
- `execution`은 사용자가 명시적으로 버튼을 눌렀을 때만 실행된다. Service Call endpoint는 `routers/service_execution.py` L26, Action Goal endpoint는 `routers/action_execution.py` L26이다.
- `manual_definition` 저장 성공은 build 성공이 아니다. 저장은 `routers/interface_management.py` L171에서 시작하고, 실제 적용은 `routers/interface_apply.py` L25에서 시작한다.
- `snapshot`은 현재 cache를 복사한 응답이다. Topic snapshot은 `ros_monitor.py` L113 → `topic/runtime.py` L70 흐름이다.

- 모니터링(관찰)과 실행(요청)은 다른 Runtime 흐름을 가집니다.
- `full_type` 매칭 없이 이름만으로 호출하면 타입 오류가 발생합니다.
- 인터페이스 파일 변경 후 `apply/build` 과정 없이는 사용할 수 없습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. 모니터링(Graph)과 실행(Interface Lab) 기능이 공존합니다.
2. `registry`, `full_type`, `apply` 개념이 Interface Lab의 핵심입니다.
3. `snapshot`은 모니터링 데이터의 안전한 API 전달 방식입니다.
