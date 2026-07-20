# 핵심 개념

## 1. ROS2 통신 요소

**Node**는 센서 읽기나 로봇 제어처럼 하나의 역할을 수행하는 ROS2 프로그램
단위입니다. 이 프로젝트는 Node 이름뿐 아니라 각 Node가 연결한 Topic, Service,
Action 관계도 수집합니다.

**Topic**은 데이터를 계속 발행하고 구독하는 통신 채널입니다.

**Service**는 client가 한 번 요청하고 server가 응답하는 통신입니다.

**Action**은 오래 걸리는 작업을 Goal, Feedback, Result로 나눈 통신입니다.

## 2. Interface Lab 관련 개념

Interface Lab은 ROS2 인터페이스를 동적으로 관리하고 로봇과 상호작용하는 핵심 기능입니다.

- **registry**: 등록된 모든 인터페이스의 메타데이터를 관리하는 저장소 (`interface_registry.yaml`).
- **full_type**: 패키지명을 포함한 ROS2 인터페이스의 고유 식별자 (예: `can_interfaces/action/CanControl`).
- **인터페이스 등록 방식**:
    - **manual_type**: 사용자가 수동으로 타입 정의.
    - **manual_definition**: 사용자가 직접 `.msg/.srv/.action` 정의.
    - **single_upload**: 단일 파일 업로드.
    - **package_upload**: 완전한 패키지 폴더 업로드.
- **build/apply**: `manual_definition`, `single_upload`, `package_upload` 방식으로 등록한 인터페이스 파일을 실제 ROS2 패키지 구조로 만들고 `colcon build`를 실행하는 과정입니다. CMakeLists.txt와 package.xml 재생성은 `manual_interfaces.py`가 담당하고, `interface_apply.py`가 colcon build를 실행합니다. `manual_type`은 파일을 생성하지 않으므로 build가 필요 없습니다.
- **callable**: 서비스나 액션이 현재 로봇에서 호출 가능한지 여부 (스키마와 타입 일치 여부 확인).
- **exact match**: 이름뿐만 아니라 `full_type`까지 일치해야 정확한 호출이 가능함.

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

- 모니터링(관찰)과 실행(요청)은 다른 Runtime 흐름을 가집니다.
- `full_type` 매칭 없이 이름만으로 호출하면 타입 오류가 발생합니다.
- 인터페이스 파일 변경 후 `apply/build` 과정 없이는 사용할 수 없습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. 모니터링(Graph)과 실행(Interface Lab) 기능이 공존합니다.
2. `registry`, `full_type`, `apply` 개념이 Interface Lab의 핵심입니다.
3. `snapshot`은 모니터링 데이터의 안전한 API 전달 방식입니다.
