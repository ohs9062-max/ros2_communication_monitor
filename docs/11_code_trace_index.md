# 기능별 코드 위치 빠른 색인

> 라인 번호는 2026-07-14 실제 코드 기준이다. 함수명은 실제 코드 기준이며 추측 이름을 사용하지 않는다.

## 1. 이 색인을 사용하는 방법

기능을 추적할 때는 "누가 시작하는가 → 어떤 함수가 처리하는가 → 어느 cache에
저장하는가 → 어떤 API와 화면이 읽는가" 순서로 봅니다. 함수가 정의된 위치와 그
함수를 호출하는 위치는 다를 수 있습니다.

## 2. Interface Lab 추적 (등록 및 상호작용)

### 2-1. 인터페이스 등록 (단일 파일 / manual)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| single_upload 파일 등록 | `interface_registry.py` | `register_interface` |
| manual_type 등록 (파일 생성 없음) | `manual_interfaces.py` | `register_manual_type` |
| manual_definition 파일 작성 및 등록 | `manual_interfaces.py` | `write_manual_definition` |
| manual_definition 수정 | `manual_interfaces.py` | `update_manual_definition` |
| single_upload / manual_definition 삭제 | `manual_interfaces.py` | `delete_uploaded_interface`, `delete_manual_definition` |
| registry 항목 삭제 | `interface_registry.py` | `delete_registry_entry` |
| registry 조회 (snapshot) | `interface_registry.py` | `registry_snapshot` |

### 2-2. 인터페이스 등록 (package upload)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| zip/multipart 업로드 | `interface_packages.py` | `upload_interface_package` |
| folder 업로드 | `interface_packages.py` | `upload_interface_package_folder` |
| package 목록 조회 | `interface_packages.py` | `packages_snapshot` |
| package 삭제 | `interface_packages.py` | `delete_interface_package` |

> `package_upload`는 `interface_registry.py`가 아닌 `interface_packages.py`가 별도로 담당한다.
> 두 모듈의 registry와 저장 경로는 서로 다르다.

### 2-3. CMake / package.xml 재생성

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| uploaded_interfaces 전체 재생성 (생성/삭제 시) | `manual_interfaces.py` | `regenerate_uploaded_interfaces_package` |
| CMakeLists.txt 전체 재작성 | `manual_interfaces.py` | `regenerate_uploaded_interfaces_cmake` |
| package.xml 전체 재작성 | `manual_interfaces.py` | `regenerate_uploaded_interfaces_package_xml` |
| 현재 파일 목록 스캔 | `manual_interfaces.py` | `scan_uploaded_interface_files` |
| cmake만 수동 재생성 (API) | `manual_interfaces.py` | `rebuild_uploaded_interfaces_cmake` |

> `interface_apply.py`는 CMake/package.xml을 재생성하지 않는다. `manual_interfaces.py`가 파일 저장/삭제 시점에 즉시 재생성한다.

### 2-4. apply / build / import

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| colcon build 실행 | `interface_apply.py` | `run_interface_apply` |
| 변경 pending 상태 기록 | `interface_apply.py` | `mark_interface_change_pending` |
| build 후 import check 및 registry 갱신 | `interface_apply.py` | `run_import_check_and_update_registry` |
| registry import 상태 갱신 | `interface_registry.py` | `refresh_registry_imports` |
| package import 상태 갱신 | `interface_packages.py` | `refresh_package_imports` |
| apply 상태 조회 | `interface_apply.py` | `apply_status` |

### 2-5. Service Call (Interface Lab 명시적 호출)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| callable Service 목록 | `service/call_runtime.py` | `callable_services` |
| Service 요청 전송 | `service/call_runtime.py` | `call_service` |
| Service call history | `ros_monitor.py` | `service_call_history` |
| Service receive-shaped history | `ros_monitor.py` | `receive_service_history` |
| Service history reset | `ros_monitor.py` | `reset_receive_service_history` |

### 2-6. Action Goal (Interface Lab 명시적 실행)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| callable Action 목록 | `action/goal_runtime.py` | `callable_actions` |
| Action Goal 전송 | `action/goal_runtime.py` | `send_goal` |
| Action goal history | `ros_monitor.py` | `action_goal_history` |
| Action receive-shaped history | `ros_monitor.py` | `receive_action_history` |
| Action history reset | `ros_monitor.py` | `reset_receive_action_history` |

### 2-7. Topic Receive (Interface Lab 명시적 구독)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| Topic 구독 시작 | `ros_monitor.py` | `start_receive_topic` |
| Topic 구독 중지 | `ros_monitor.py` | `stop_receive_topic` |
| 구독 중인 Topic 목록 | `ros_monitor.py` | `receive_topics` |
| Topic 수신 history | `ros_monitor.py` | `receive_topic_history` |
| Topic history reset | `ros_monitor.py` | `reset_receive_topic_history` |
| 실제 구독 Runtime | `interface_receive_runtime.py` | `start_topic`, `stop_topic`, `topic_history` |

## 3. Backend 시작과 모니터링 공통 흐름

| 기능 | 시작·호출 | 핵심 처리 |
|---|---|---|
| 서버 시작 | `main.py` lifespan | `RosMonitor.start` |
| Graph 반복 갱신 | `ros_monitor.py` timer | `RosMonitor._update_graph` |
| Alert 통합 | `ros_monitor.py` | `RosMonitor.alerts` |
| WebSocket snapshot | `main.py` | `RosMonitor.websocket_snapshot` |

## 4. Frontend 통합 추적

| 기능 | 상태·호출 | 주요 화면 |
|---|---|---|
| 모니터링 Polling | `usePolling.js`, `rosApi.js` | `TopicsPage`, `ServicesPage`, `ActionsPage` |
| Interface Lab | `rosApi.js` (직접 호출) | `InterfaceLabPage.jsx` |
| 업로드 UI / Service Call / Action Goal / Receive | `InterfaceUploadControl.jsx` | `InterfaceLabPage` |

## 5. 핵심 개념 매핑

- **full_type**: `interface_registry.py`의 registry entry에 `full_type` 키로 저장. `manual_interfaces.py`의 등록 함수가 구성한다.
- **registry**: 단일 파일/manual은 `backend/config/interface_registry.yaml`, package는 `backend/config/interface_packages.yaml`.
- **callable**: 등록 후 import 가능 (`import_available=True`) + 현재 graph에 server 1개 이상 → callable. `_allowed_service()` (`service/call_runtime.py`), `_allowed_action()` (`action/goal_runtime.py`).
- **ActionClient 캐시 key**: `(action_name, action_type)` 쌍. 같은 이름이라도 full_type이 다르면 별도 클라이언트.
- **manual_type 예외**: `register_manual_type()`은 파일을 생성하지 않으므로 CMake 재생성과 build 대상이 아니다.

## 6. 내가 반드시 알아야 할 것 3줄 요약

1. Backend는 '모니터링'과 'Interface Lab'이라는 두 영역으로 코드가 분리되어 있습니다.
2. 인터페이스 등록 로직은 `interface_registry.py`(single/manual)와 `manual_interfaces.py`(파일 생성/삭제/CMake)가, package는 `interface_packages.py`가, 빌드 실행은 `interface_apply.py`가 담당합니다.
3. Service/Action history는 `ros_monitor.py`의 `service_call_history`, `action_goal_history` 등으로 접근하고, Topic Receive는 `receive_topic_history`로 접근합니다.
