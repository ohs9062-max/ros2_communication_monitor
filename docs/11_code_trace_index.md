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
| single_upload 파일 등록 | `interface_lab/management/registry.py` | `register_interface` |
| manual_type 등록 (파일 생성 없음) | `interface_lab/management/manual_interfaces.py` | `register_manual_type` |
| manual_definition 파일 작성 및 등록 | `interface_lab/management/manual_interfaces.py` | `write_manual_definition` |
| manual_definition 수정 | `interface_lab/management/manual_interfaces.py` | `update_manual_definition` |
| single_upload / manual_definition 삭제 | `interface_lab/management/manual_interfaces.py` | `delete_uploaded_interface`, `delete_manual_definition` |
| registry 항목 삭제 | `interface_lab/management/registry.py` | `delete_registry_entry` |
| registry 조회 (snapshot) | `interface_lab/management/registry.py` | `registry_snapshot` |

### 2-2. 인터페이스 등록 (package upload)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| zip/multipart 업로드 | `interface_lab/management/packages.py` | `upload_interface_package` |
| folder 업로드 | `interface_lab/management/packages.py` | `upload_interface_package_folder` |
| package 목록 조회 | `interface_lab/management/packages.py` | `packages_snapshot` |
| package 삭제 | `interface_lab/management/packages.py` | `delete_interface_package` |

> `package_upload`는 `interface_lab/management/registry.py`가 아닌 `interface_lab/management/packages.py`가 별도로 담당한다.
> 두 모듈의 registry와 저장 경로는 서로 다르다.

### 2-3. CMake / package.xml 재생성

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| uploaded_interfaces 전체 재생성 (생성/삭제 시) | `interface_lab/management/manual_interfaces.py` | `regenerate_uploaded_interfaces_package` |
| CMakeLists.txt 전체 재작성 | `interface_lab/management/manual_interfaces.py` | `regenerate_uploaded_interfaces_cmake` |
| package.xml 전체 재작성 | `interface_lab/management/manual_interfaces.py` | `regenerate_uploaded_interfaces_package_xml` |
| 현재 파일 목록 스캔 | `interface_lab/management/manual_interfaces.py` | `scan_uploaded_interface_files` |
| cmake만 수동 재생성 (API) | `interface_lab/management/manual_interfaces.py` | `rebuild_uploaded_interfaces_cmake` |

> `interface_lab/apply/runtime.py`는 CMake/package.xml을 재생성하지 않는다. `interface_lab/management/manual_interfaces.py`가 파일 저장/삭제 시점에 즉시 재생성한다.

### 2-4. apply / build / import

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| colcon build 실행 | `interface_lab/apply/runtime.py` | `run_interface_apply` |
| 변경 pending 상태 기록 | `interface_lab/apply/runtime.py` | `mark_interface_change_pending` |
| build 후 import check 및 registry 갱신 | `interface_lab/apply/runtime.py` | `run_import_check_and_update_registry` |
| registry import 상태 갱신 | `interface_lab/management/registry.py` | `refresh_registry_imports` |
| package import 상태 갱신 | `interface_lab/management/packages.py` | `refresh_package_imports` |
| apply 상태 조회 | `interface_lab/apply/runtime.py` | `apply_status` |

### 2-5. Service Call (Interface Lab 명시적 호출)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| callable Service 목록 | `interface_lab/execution/service_call_runtime.py` | `callable_services` |
| Service 요청 전송 | `interface_lab/execution/service_call_runtime.py` | `call_service` |
| Service call history | `ros_monitor.py` | `service_call_history` |
| Service receive-shaped history | `ros_monitor.py` | `receive_service_history` |
| Service history reset | `ros_monitor.py` | `reset_receive_service_history` |

### 2-6. Action Goal (Interface Lab 명시적 실행)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| callable Action 목록 | `interface_lab/execution/action_goal_runtime.py` | `callable_actions` |
| Action Goal 전송 | `interface_lab/execution/action_goal_runtime.py` | `send_goal` |
| Action goal history | `ros_monitor.py` | `action_goal_history` |
| Action receive-shaped history | `ros_monitor.py` | `receive_action_history` |
| Action history reset | `ros_monitor.py` | `reset_receive_action_history` |

### 2-7. Topic Publish/Receive (Interface Lab 명시적 Topic 작업)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| callable Message 목록 | `interface_lab/execution/topic_runtime.py` | `callable_messages` |
| Message schema 조회 | `interface_lab/execution/topic_runtime.py` | `message_schema` |
| Topic 1회 Publish | `interface_lab/execution/topic_runtime.py` | `publish_topic` |
| Topic Publisher cache | `interface_lab/execution/topic_runtime.py` | `_publisher` |
| Publish history | `interface_lab/execution/topic_runtime.py` | `publish_history`, `reset_publish_history` |
| Topic 구독 시작 | `ros_monitor.py` | `start_receive_topic` |
| Topic 구독 중지 | `ros_monitor.py` | `stop_receive_topic` |
| 구독 중인 Topic 목록 | `ros_monitor.py` | `receive_topics` |
| Topic 수신 history | `ros_monitor.py` | `receive_topic_history` |
| Topic history reset | `ros_monitor.py` | `reset_receive_topic_history` |
| 실제 구독 Runtime | `interface_lab/execution/topic_runtime.py` | `start_topic`, `stop_topic`, `topic_history` |
| package upload msg 목록 | `interface_lab/management/packages.py` | `registered_package_messages` |
| message payload 변환 | `interface_lab/common/value_converter.py` | `build_ros_message`, `fill_ros_message`, `convert_value` |

`stop_topic`은 Subscription을 destroy하고 `receiving=false`로 표시하지만, 기존 receive history는 `reset_topic_history` 전까지 보존합니다.
`publish_topic`은 새 Publisher를 만든 첫 호출에서 짧은 discovery 대기 후 publish하여 외부 subscriber가 첫 메시지를 놓칠 가능성을 줄입니다.

관련 API:

```text
GET    /ros/interfaces/callable-messages
GET    /ros/interfaces/message-schema?full_type=...
POST   /ros/interfaces/topic-publish
GET    /ros/interfaces/topic-publish/history
POST   /ros/interfaces/topic-publish/history/reset
POST   /ros/interfaces/receive/topics/start
POST   /ros/interfaces/receive/topics/stop
GET    /ros/interfaces/receive/topics
GET    /ros/interfaces/receive/topics/history
POST   /ros/interfaces/receive/topics/history/reset
```

Topic Publish/Receive는 `(topic_name, full_type)` 기준입니다. 같은 Topic 이름이라도 Message type이 다르면 별도 Publisher/Subscription/cache로 취급합니다.

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
| 상단 Topic Publish/Subscribe UI | `InterfaceUploadControl.jsx` | `수신` → `Topic 수신`, `RequestField`, Message full_type select |
| 하단 Topic Publish/Subscribe UI | `InterfaceLabPage.jsx` | `TopicWorkspaceDetail`, `RequestField` |
| Topic API 함수 | `rosApi.js` | `fetchCallableMessages`, `publishTopicMessage`, `startReceiveTopic`, `stopReceiveTopic`, `fetchTopicPublishHistory`, `fetchReceiveTopicHistory` |

## 5. 핵심 개념 매핑

- **full_type**: `interface_lab/management/registry.py`의 registry entry에 `full_type` 키로 저장. `interface_lab/management/manual_interfaces.py`의 등록 함수가 구성한다.
- **registry**: 단일 파일/manual은 `backend/config/interface_registry.yaml`, package는 `backend/config/interface_packages.yaml`.
- **callable**: 등록 후 import 가능 (`import_available=True`) + 현재 graph에 server 1개 이상 → callable. `_allowed_service()` (`interface_lab/execution/service_call_runtime.py`), `_allowed_action()` (`interface_lab/execution/action_goal_runtime.py`).
- **ActionClient 캐시 key**: `(action_name, action_type)` 쌍. 같은 이름이라도 full_type이 다르면 별도 클라이언트.
- **manual_type 예외**: `register_manual_type()`은 파일을 생성하지 않으므로 CMake 재생성과 build 대상이 아니다.
- **Topic key**: Interface Lab Topic Publish/Subscribe는 `(topic_name, message_type)` 쌍으로 Publisher/Subscription을 재사용하거나 중복 방지한다.

## 6. 내가 반드시 알아야 할 것 3줄 요약

1. Backend는 '모니터링'과 'Interface Lab'이라는 두 영역으로 코드가 분리되어 있습니다.
2. 인터페이스 등록 로직은 `interface_lab/management/registry.py`(single/manual)와 `interface_lab/management/manual_interfaces.py`(파일 생성/삭제/CMake)가, package는 `interface_lab/management/packages.py`가, 빌드 실행은 `interface_lab/apply/runtime.py`가 담당합니다.
3. Service/Action history는 `ros_monitor.py`의 `service_call_history`, `action_goal_history` 등으로 접근하고, Topic Publish/Receive는 `topic_publish_history`, `receive_topic_history`로 접근합니다.
