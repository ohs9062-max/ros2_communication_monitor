# 문서 최신화 작업 인계

## 0. 목적과 사용 범위

이 문서는 이전 문서 최신화 작업에서 이미 확인한 코드 근거를 다음 Codex
세션에 인계한다. 다음 세션은 이 내용을 출발점으로 삼아 지정된 10개 문서를
수정하고, 사실 확인이 꼭 필요한 항목만 좁게 재확인한다.

- 애플리케이션 코드를 수정하지 않는다.
- 대형 파일과 저장소 전체를 처음부터 다시 조사하지 않는다.
- 아래에서 `재확인 필요`로 표시한 이름은 문서에 쓰기 전에 해당 정의만 확인한다.
- 파일 경로는 저장소 루트 기준이다.

## 1. 조사 완료한 코드 파일

### Backend

- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_registry.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/manual_interfaces.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_packages.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_apply.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_value_converter.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/call_runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/goal_runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_receive_runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/active_check_runtime.py`

### Frontend

- `frontend/src/App.jsx`
- Interface Lab route를 정의하는 `useBrowserRoute` 포함 파일
- `InterfaceLabPage` 포함 파일
- `InterfaceUploadControl` 포함 파일
- Interface Lab API 요청 함수를 정의한 파일

마지막 네 frontend 파일의 정확한 경로는 이전 조사 결과에 보존되지 않았다.
클래스·함수명 검색으로 좁게 찾으면 되며, 전체 frontend 재조사는 필요 없다.

## 2. 파일별 확인한 클래스와 함수

| 파일 | 클래스 | 함수/메서드 | 담당 기능 |
|---|---|---|---|
| `main.py` | FastAPI 애플리케이션 | Interface endpoint 처리 함수들 | 요청 검증, `RosMonitor`/interface 모듈 호출, HTTP 응답 |
| `ros_monitor.py` | `RosMonitor` | callable/call/goal/receive/history 공개 메서드 | Service Call, Action Goal, Receive runtime을 조립하고 API용 snapshot 제공 |
| `interface_registry.py` | 해당 없음 | `register_interface`, `_install_interface`, `delete_uploaded_interface`, `scan_uploaded_interface_files`, `regenerate_uploaded_interfaces_package`, `regenerate_uploaded_interfaces_cmake`, `regenerate_uploaded_interfaces_package_xml` | 단일 파일 등록, 실제 파일 스캔, metadata 전체 재생성, 정확한 파일/registry 삭제 |
| `manual_interfaces.py` | 해당 없음 | `register_manual_type`, `validate_manual_definition`, `write_manual_definition` | 기존 타입 선언 등록과 직접 작성 interface 검증/저장 |
| `interface_packages.py` | 해당 없음 | `upload_interface_package`, 폴더 업로드 함수, `_store_package_root`, `delete_interface_package` | zip/폴더 ROS interface package를 별도 저장·등록·삭제 |
| `interface_apply.py` | 해당 없음 | `mark_interface_change_pending`, `run_interface_apply`, `run_import_check_and_update_registry`, `record_import_check_status` | pending 상태, colcon build, import check, apply 상태/로그 저장 |
| `interface_value_converter.py` | 해당 없음 | `build_ros_message`, `fill_ros_message`, `convert_value` | schema 입력을 ROS message로 변환하고 custom message/배열을 재귀 처리 |
| `service/call_runtime.py` | `ServiceCallRuntime` | callable 목록, `_allowed_service`, schema 생성, `call_service`, history 관련 메서드 | exact name/type 검증 후 명시적 Service 요청 전송 |
| `action/goal_runtime.py` | `ActionGoalRuntime` | callable 목록, `_allowed_action`, action graph 조립, goal 전송, feedback/result/history 관련 메서드 | exact name/type 검증 후 명시적 Action Goal 전송 |
| `interface_receive_runtime.py` | `InterfaceReceiveRuntime` | `start_topic`, `stop_topic`, `topics`, `topic_history`, `reset_topic_history` | Interface Lab의 명시적 Topic subscription과 최대 500개 history |
| `action/runtime.py` | `ActionRuntime` | graph/status/feedback 갱신 관련 메서드 | Action 관찰 runtime; 명시적 Goal 전송 runtime과 별도 |
| `action/result_runtime.py` | `ActionResultRuntime` | 관찰 Goal result 조회 관련 메서드 | status에서 관찰된 terminal goal의 제한적 get_result |
| `service/runtime.py` | `ServiceRuntime` | graph/cache/snapshot 관련 메서드 | Service graph monitoring과 active check 조립 |
| `service/active_check_runtime.py` | `ServiceActiveCheckRuntime` | allowlist 검사/호출 관련 메서드 | 허용된 Service만 background active check |
| frontend route 파일 | 해당 없음 | `useBrowserRoute` | `/interface-lab` route 판별 |
| `App.jsx` | `App` | component render | `/interface-lab`에서 `InterfaceLabPage` 표시 |
| Interface Lab page 파일 | `InterfaceLabPage` | fetch/refresh 관련 callback | registry, package, apply, callable, history, topic/graph 상태 조회 |
| Interface upload UI 파일 | `InterfaceUploadControl` | 등록/삭제/apply/call/goal/receive handlers | Interface Lab 작업 UI와 성공 후 목록 갱신 |
| Interface Lab page/UI 파일 | 해당 없음 | `buildWorkspaceItems`, `mergeGraphServiceEntries`, `mergeGraphActionEntries`, `mergeWorkspaceItemsByType`, `mergeWorkspaceItem` | registry/package/graph row를 type과 `full_type` 기준으로 병합 |
| Interface form 파일 | `RequestField` | 동적 field render/submit normalization | request/goal schema 기반 form과 nested JSON 입력 |

`main.py` endpoint 처리 함수명, package folder upload 함수명, frontend 파일의
정확한 경로와 일부 handler 이름은 **재확인 필요**다. 경로·endpoint와 내부 핵심
함수의 동작은 확인되었다.

## 3. 확인한 API endpoint

아래 endpoint는 `main.py`에서 확인했다. `main.py 처리 함수`는 이전 조사 기록에
정확한 Python 식별자가 남지 않은 경우 `재확인 필요`로 표기했다.

| Method | Path | `main.py` 처리 함수 | 내부 호출 함수/대상 |
|---|---|---|---|
| POST | `/ros/interfaces/upload` | 재확인 필요 | `interface_registry.register_interface` |
| GET | `/ros/interfaces/registry` | 재확인 필요 | registry 조회 |
| DELETE | `/ros/interfaces/registry/{kind}/{type_name}` 계열 | 재확인 필요 | uploaded file이면 `delete_uploaded_interface`, 그 외 registry entry 삭제 |
| POST | `/ros/interfaces/manual-type` | 재확인 필요 | `manual_interfaces.register_manual_type` |
| POST | `/ros/interfaces/manual-definition` | 재확인 필요 | `manual_interfaces.write_manual_definition` |
| POST | `/ros/interfaces/manual-definition/validate` | 재확인 필요 | `manual_interfaces.validate_manual_definition` |
| PUT | `/ros/interfaces/manual-definition/{kind}/{type_name}` | 재확인 필요 | 직접 작성 파일 갱신 및 package 재생성 |
| DELETE | `/ros/interfaces/manual-definition/{kind}/{type_name}` | 재확인 필요 | uploaded file 삭제, metadata/registry 정리 |
| POST | `/ros/interfaces/uploaded-interfaces/rebuild-cmake` | 재확인 필요 | `regenerate_uploaded_interfaces_package` 계열 |
| POST | `/ros/interfaces/packages/upload` | 재확인 필요 | `interface_packages.upload_interface_package` |
| POST | `/ros/interfaces/packages/folder-upload` | 재확인 필요 | folder upload 함수 |
| GET | `/ros/interfaces/packages` | 재확인 필요 | package registry 조회 |
| DELETE | `/ros/interfaces/packages/{package_name}` 계열 | 재확인 필요 | `interface_packages.delete_interface_package` |
| POST | `/ros/interfaces/apply` | 재확인 필요 | `interface_apply.run_interface_apply` |
| GET | `/ros/interfaces/apply/status` | 재확인 필요 | apply status 조회 |
| POST | `/ros/interfaces/import-check` | 재확인 필요 | `run_import_check_and_update_registry` |
| GET | `/ros/interfaces/callable-services` | 재확인 필요 | `RosMonitor` → `ServiceCallRuntime` callable snapshot |
| POST | `/ros/interfaces/service-call` | 재확인 필요 | `RosMonitor` → `ServiceCallRuntime.call_service` |
| GET | `/ros/interfaces/service-call/history` | 재확인 필요 | Service Call history |
| GET | `/ros/interfaces/callable-actions` | 재확인 필요 | `RosMonitor` → `ActionGoalRuntime` callable snapshot |
| POST | `/ros/interfaces/action-goal` | 재확인 필요 | `RosMonitor` → `ActionGoalRuntime` goal 전송 |
| GET | `/ros/interfaces/action-goal/history` | 재확인 필요 | Action Goal history |
| POST | `/ros/interfaces/receive/topics/start` | 재확인 필요 | `InterfaceReceiveRuntime.start_topic` |
| POST | `/ros/interfaces/receive/topics/stop` | 재확인 필요 | `InterfaceReceiveRuntime.stop_topic` |
| GET | `/ros/interfaces/receive/topics` | 재확인 필요 | `InterfaceReceiveRuntime.topics` |
| GET | `/ros/interfaces/receive/topics/history` | 재확인 필요 | `InterfaceReceiveRuntime.topic_history` |
| POST | `/ros/interfaces/receive/topics/history/reset` | 재확인 필요 | `InterfaceReceiveRuntime.reset_topic_history` |
| GET | `/ros/interfaces/receive/services/history` | 재확인 필요 | `RosMonitor.receive_service_history` |
| POST | `/ros/interfaces/receive/services/history/reset` | 재확인 필요 | Service history timestamp reset |
| GET | `/ros/interfaces/receive/actions/history` | 재확인 필요 | `RosMonitor.receive_action_history` |
| POST | `/ros/interfaces/receive/actions/history/reset` | 재확인 필요 | Action history timestamp reset |

DELETE endpoint의 정확한 path parameter 구성은 문서에 그대로 옮기기 전에
`main.py` decorator 한정으로 **재확인 필요**다.

## 4. Interface 등록 방식별 실제 흐름

### `manual_type`

1. 이미 설치/import 가능한 `<package>/<msg|srv|action>/<TypeName>`을 선언한다.
2. `manual_interfaces.register_manual_type`이 type을 확인하고
   `config/interface_registry.yaml`에 `source: manual_type`으로 등록한다.
3. interface 파일, CMakeLists.txt, package.xml은 생성하지 않는다.
4. 새 빌드가 필요하지 않으므로 `rebuild_required: false`이며 import 상태를 확인한다.

### `manual_definition`

1. 사용자가 `.msg`, `.srv`, `.action` 정의를 직접 입력한다.
2. `validate_manual_definition`으로 형식과 kind/name을 검증한다.
3. `write_manual_definition`이 `src/uploaded_interfaces/<kind>/`에 실제 파일을 쓴다.
4. 실제 남은 파일을 다시 스캔해 CMakeLists.txt와 package.xml을 전체 재생성한다.
5. registry에는 `source: manual_definition`, `rebuild_required: true`로 반영한다.

### `single_upload`

1. `interface_registry.register_interface`가 단일 `.msg/.srv/.action` 업로드를 받는다.
2. `_install_interface`가 대상 package에 파일을 저장하고 registry entry를 만든다.
3. `source: single_upload`이며 `full_type`은 대상 package/kind/type으로 구성한다.
4. 대상이 `uploaded_interfaces`이면 append하지 않고
   `regenerate_uploaded_interfaces_package`로 metadata를 전체 재생성한다.
5. 다른 target package의 legacy update 경로도 존재한다. 이 분기는 문서에
   상세히 쓸 필요가 있다면 `_update_cmake`, `_update_package_xml` 정의를
   좁게 **재확인 필요**다.

### `package_upload`

1. zip 또는 folder upload로 완성된 ROS interface package를 받는다.
2. package root, package.xml, CMakeLists.txt와 interface 파일을 검증한다.
3. `_store_package_root`가 package 이름을 보존해
   `src/uploaded_interface_packages/<package_name>`에 저장한다.
4. package 기록은 `config/interface_packages.yaml`에
   `source: uploaded_package`, `rebuild_required: true`로 저장한다.
5. 단일 파일용 `uploaded_interfaces`와 package upload 저장소/삭제 경로는 분리된다.

## 5. 저장 위치와 registry 구분

| 위치 | 역할 |
|---|---|
| `backend/config/interface_registry.yaml` | `manual_type`, `manual_definition`, `single_upload` 개별 interface registry |
| `backend/config/interface_packages.yaml` | zip/folder `package_upload` 기록; 단일 interface 삭제 시 건드리지 않음 |
| `backend/config/interface_apply_status.yaml` | 마지막 pending/build/import/apply 상태 |
| `backend/src/uploaded_interfaces` | 직접 작성/단일 업로드 파일을 모은 하나의 ROS interface package |
| `backend/src/uploaded_interface_packages` | 원래 package 구조와 이름을 보존하는 package upload 저장소 |
| `backend/src/ros2_dashboard_interfaces` | `MonitorStatus.msg`, `KeyValue.msg` 등 프로젝트 내장 공통 interface package |

`uploaded_interfaces`와 `uploaded_interface_packages`는 이름이 비슷하지만
registry, build metadata, 삭제 범위가 서로 다르다.

## 6. 생성·수정·삭제 생명주기

### 실제 파일과 metadata

- `scan_uploaded_interface_files`가 `uploaded_interfaces/msg`, `srv`, `action`의
  실제 확장자 파일을 현재 시점에 다시 수집한다.
- `regenerate_uploaded_interfaces_cmake`와
  `regenerate_uploaded_interfaces_package_xml`은 기존 내용에 append하지 않고
  스캔 결과로 전체 파일을 다시 쓴다.
- interface가 하나 이상이면 `ament_cmake`,
  `rosidl_default_generators`, `rosidl_generate_interfaces`,
  `ament_export_dependencies(rosidl_default_runtime)`, `ament_package()`와
  package.xml의 rosidl 의존성/group membership을 포함한다.
- interface가 0개이면 CMakeLists.txt는 최소 `ament_cmake` package가 되며
  `rosidl_generate_interfaces()`를 남기지 않는다. package.xml도 빈 package가
  build 가능하도록 rosidl 관련 항목을 제거한다.

### 삭제

1. 삭제 요청은 registry의 `file`, `source`, `full_type`에 맞는 정확한 단일
   `uploaded_interfaces` 파일만 대상으로 한다.
2. `delete_uploaded_interface`가 파일을 삭제한다.
3. 남은 실제 interface 파일을 다시 스캔해 CMakeLists.txt/package.xml을 재생성한다.
4. `config/interface_registry.yaml`에서 해당 entry를 제거한다.
5. `config/interface_packages.yaml`과
   `src/uploaded_interface_packages/<other-package>`는 건드리지 않는다.
6. `mark_interface_change_pending`으로 삭제 사실과 rebuild 필요 상태를 남긴다.
7. 응답에는 `build_required: true` 또는 `rebuild_required: true`가 반영된다.

### Frontend refresh

삭제 API 성공 후 frontend는 최소한 다음 상태를 다시 조회한다.

- 개별 interface registry
- uploaded package 목록
- callable Service 목록
- callable Action 목록
- apply/build/import 상태

따라서 삭제한 row나 실행 후보가 로컬 state에 계속 남지 않는다.

## 7. Service Call 확인 내용

- 기존 `ServiceRuntime`의 Graph monitoring과
  `ServiceActiveCheckRuntime`의 allowlist background check는 유지된다.
- 사용자가 Interface Lab에서 실행하는 요청은 별도 `ServiceCallRuntime`이 담당한다.
- callable 조건은 registry/package에서 import 가능한 `.srv`이고, 현재 Graph에
  같은 `service_name`과 같은 전체 `service_type`이 있으며
  `server_count >= 1`인 경우다.
- `_allowed_service`는 `(service_name, service_type)` exact match를 다시 검사한다.
- client cache도 name/type 쌍을 기준으로 분리된다.
- schema는 parsed request schema를 사용하며, 필요할 때 service class의
  `get_fields_and_field_types()`에서 생성한다.
- `build_ros_message` → `fill_ros_message` → `convert_value`가 request를 변환한다.
- scalar, 배열/sequence, nested custom message와 custom message 배열을
  재귀 변환하고 숫자 범위, bool/float/string을 검증한다.
- validation 실패는 서버 전송 전에 종료되며
  `sent_to_server: false`, `called: false`, `error_type: validation_error`로 남는다.
- timeout 기본값은 2초, 최대값은 10초로 확인했다.
- response는 JSON-safe dict/preview로 변환하며 최근 실행 history는 최대 30개다.

## 8. Action Goal 확인 내용

- 기존 `ActionRuntime`/`ActionResultRuntime`은 Graph, status, feedback와 관찰된
  terminal Goal result를 다루는 관찰 경로다.
- 사용자가 실행한 Goal은 별도 `ActionGoalRuntime`이 담당한다.
- action graph를 만들 때 모든 graph type을 순회하며 `types[0]`에 의존하지 않는다.
- callable 조건은 import 가능한 등록 `.action`, exact
  `(action_name, full_type)` Graph match, exact type `server_count >= 1`이다.
- `_allowed_action`이 name/type 쌍을 다시 검증한다.
- server/client count도 node graph의 `(name, type)`별 값이다.
- `ActionClient` cache key는 `(action_name, action_type)`이므로 같은 이름의
  서로 다른 type을 하나로 섞지 않는다.
- 요청의 `action_type`과 `full_type` 일치도 backend에서 확인한다.
- Goal 변환은 Service request와 같은 recursive message converter 원칙을 사용한다.
- validation 실패 시 `sent_to_server: false`이며 Goal을 보내지 않는다.
- goal accepted/rejected, feedback callback, result를 JSON-safe 형태로 저장한다.
- timeout 기본값은 10초, 최대값은 60초로 확인했다.
- 실행 history는 최대 30개다.
- 명시적 Goal 경로에서 `rejected`, `timeout`, `validation_error`, `result_error`를
  구분한다. `aborted`, `canceled` 및 관찰 result 오류는 기존 Action monitoring과
  alert에도 반영된다.
- 각 종료 상태의 정확한 JSON field 조합은 상세 표를 문서화하기 전에
  `ActionGoalRuntime`의 result 조립부만 **재확인 필요**다.

## 9. Topic Receive와 Service/Action history 구조

### Topic Receive

- `InterfaceReceiveRuntime`만 명시적 Topic subscription을 생성/소유한다.
- `start_topic`, `stop_topic`, `topics`, `topic_history`,
  `reset_topic_history`로 시작/중지/목록/history/reset을 제공한다.
- Topic history 최대 크기는 500개다.
- 일반 Topic monitor의 자동 발견/deep monitoring과 Interface Lab 사용자가
  시작하는 Receive는 목적과 runtime이 다르다.

### Service history

- Service는 Topic처럼 response topic을 별도 subscribe하지 않는다.
- `RosMonitor.receive_service_history`가 `ServiceCallRuntime`의 호출 history에서
  response 수신 내역을 제공한다.
- reset은 timestamp 경계를 갱신해 이전 event를 숨기는 방식이며 ROS subscription을
  생성하거나 Service server를 호출하지 않는다.

### Action history

- Action도 Interface Lab history용 별도 subscription 시작 구조가 아니다.
- `RosMonitor.receive_action_history`가 `ActionGoalRuntime`의 feedback/result
  event를 history로 제공한다.
- reset은 이전 event를 timestamp 기준으로 숨긴다.
- 별도로 기존 `ActionRuntime`은 Graph/status/feedback 관찰을 계속 담당한다.

## 10. Frontend 확인 내용

- `useBrowserRoute`가 `/interface-lab` route를 인식하고 `App.jsx`가
  `InterfaceLabPage`를 렌더링한다.
- page는 registry, package, apply status, callable Service/Action,
  Topic Receive 및 Service/Action history, graph 상태를 조회한다.
- API 함수의 정확한 파일 경로와 export 이름은 **재확인 필요**다.
- `InterfaceUploadControl`이 등록 방식 선택, package upload, 삭제, apply,
  Service Call, Action Goal, Receive/history 조작을 연결한다.
- `buildWorkspaceItems`, `mergeWorkspaceItemsByType`, `mergeWorkspaceItem`이
  registry row와 package row를 type/`full_type` 기준으로 병합한다.
- `mergeGraphServiceEntries`, `mergeGraphActionEntries`는 graph 후보를
  exact name/type에 맞춰 실행 후보에 결합한다.
- 선택값은 단순 이름이 아니라 `full_type`을 보존한다.
- `RequestField`와 schema 기반 form이 Service request/Action goal 필드를 만든다.
- nested custom message와 complex array는 JSON 입력을 지원하며 submit 시 숫자 등
  타입을 정규화한다.
- 삭제 성공 후 registry/package/callable Service/callable Action/apply 상태를
  다시 fetch한다.
- UI는 `build_required`/`rebuild_required`, build 결과, import 가능 여부와
  마지막 apply 상태를 표시한다.

## 11. 기존 docs에서 발견한 오래된 설명

| 문서 | 오래되었거나 부족한 설명 |
|---|---|
| `docs/00_project_big_picture.md` | Interface Lab의 등록·빌드·실행·수신 역할과 저장소 구분이 전체 구조에 충분히 반영되지 않음 |
| `docs/01_core_concepts.md` | Service 요청을 allowlist active check로만 설명하고, Action은 dashboard가 Goal을 보내지 않는다고 설명 |
| `docs/01_environment_setup.md` | Action Goal은 외부 CLI에서만 보내고 dashboard는 전송하지 않는다는 실행 가이드 |
| `docs/02_backend_flow.md` | Interface registration/apply/import, explicit Service Call/Action Goal, Receive runtime 조립 흐름이 부족 |
| `docs/03_topic_flow.md` | 일반 Topic monitoring과 Interface Lab Topic Receive start/stop/history의 차이가 없음 또는 부족 |
| `docs/04_service_flow.md` | Graph monitoring과 allowlist active check만 중심이며 사용자 요청 기반 Service Call, schema/validation/history가 빠짐 |
| `docs/05_action_flow.md` | Action을 관찰 전용으로 설명하고 dashboard가 Goal을 보내지 않는다고 서술 |
| `docs/09_frontend_flow.md` | `/interface-lab` route/page, 4종 등록, 동적 form, 실행/수신/history/apply UI 흐름이 부족 |
| `docs/11_code_trace_index.md` | Interface Lab backend/frontend 파일, class, function, endpoint 색인이 부족 |
| `docs/12_interface_lab_flow.md` | 현재 구현 범위를 담지 못한 짧은 초안이며 등록·삭제·재생성·apply·call/goal/receive를 상세히 전면 재작성해야 함 |

찾아서 교체해야 할 대표 문구:

- `Goal을 보내지 않는다`
- `관찰 전용`
- `외부 CLI에서만`
- graph `types[0]` 사용
- CMakeLists.txt append 관리
- 삭제 시 실제 파일만 지운다는 설명

주의: 일반 Action monitoring 경로 자체는 관찰 중심이라는 설명이 여전히 맞다.
틀린 부분은 이를 Interface Lab의 별도 `ActionGoalRuntime`까지 포함한 전체 제품
정책으로 확대해 “dashboard는 절대 Goal을 보내지 않는다”고 단정하는 문장이다.

## 12. 문서별 필요한 수정 사항

### `docs/00_project_big_picture.md`

- React → FastAPI → rclpy 흐름은 유지한다.
- Interface Lab을 등록·build/import·명시적 실행·수신 도구로 추가한다.
- `uploaded_interfaces`, `uploaded_interface_packages`,
  `ros2_dashboard_interfaces`의 서로 다른 역할을 큰 구조에 표시한다.
- 관찰 runtime과 사용자 명시 실행 runtime의 안전 경계를 설명한다.
- 끝의 `내가 반드시 알아야 할 것 3줄 요약`을 현재 기능에 맞춘다.

### `docs/01_core_concepts.md`

- 자동 Graph monitoring, allowlist active check, 사용자 버튼 기반 explicit call을
  서로 다른 개념으로 구분한다.
- Action observation과 `ActionGoalRuntime`을 구분해 “Goal 미전송” 단정을 교체한다.
- 이름이 같아도 ROS2 type이 다를 수 있으므로 `full_type` exact match가 필요함을
  핵심 개념으로 추가한다.
- build/import가 필요한 generated interface 개념을 추가한다.

### `docs/01_environment_setup.md`

- 외부 CLI는 독립 테스트 예시로 남길 수 있으나 유일한 Goal 전송 방법으로
  설명하지 않는다.
- Interface Lab에서 등록 → 적용 → import 확인 → callable 선택 → 실행하는
  현재 절차를 추가한다.
- `uploaded_interfaces`가 0개여도 빈 ament package로 build 가능함을 설명한다.

### `docs/02_backend_flow.md`

- `RosMonitor`가 `ServiceCallRuntime`, `ActionGoalRuntime`,
  `InterfaceReceiveRuntime`을 조립하는 흐름을 추가한다.
- registration 4종, registry/package 저장소, apply/import 흐름을 추가한다.
- 삭제 → 실제 파일 스캔 → CMake/package.xml 전체 재생성 → pending 상태 흐름을
  함수명 중심으로 기록한다.
- explicit call/goal validation이 ROS server 전송 전에 수행됨을 표시한다.

### `docs/03_topic_flow.md`

- 기존 자동 발견, supported type deep monitoring 흐름을 유지한다.
- Interface Lab의 명시적 Topic Receive start/stop/history를 별도 절로 추가한다.
- Topic Receive와 Service/Action history가 서로 다른 구조임을 비교한다.
- 관련 endpoint와 `InterfaceReceiveRuntime` 메서드를 색인한다.

### `docs/04_service_flow.md`

- Graph monitoring, allowlist active check, 사용자 explicit Service Call의 세 경로를
  분리해 설명한다.
- callable exact `(service_name, full_type)`, server count, import 조건을 추가한다.
- request schema와 `get_fields_and_field_types`, recursive custom message 변환,
  validation 시 `sent_to_server=false`, timeout/response/history를 추가한다.
- frontend 동적 Service form과 Service response history를 연결한다.

### `docs/05_action_flow.md`

- 관찰 runtime과 Interface Lab `ActionGoalRuntime`을 명확히 분리한다.
- exact `(action_name, full_type)`, exact type count와 `(name, type)` client cache를
  추가한다.
- goal schema/변환, accepted/rejected, feedback/result/history, timeout과
  rejected/aborted/canceled/validation_error/result_error 상태를 설명한다.
- `types[0]`이 아니라 graph의 모든 type을 다룬다는 점을 반영한다.
- “dashboard는 Goal을 보내지 않는다/관찰 전용” 문장을 현재 범위로 교체한다.

### `docs/09_frontend_flow.md`

- `/interface-lab`, `InterfaceLabPage`, `InterfaceUploadControl`을 추가한다.
- 4종 등록 UI, registry/package row 병합, `full_type` 선택을 설명한다.
- schema 기반 Service/Action form과 nested custom message JSON 입력을 추가한다.
- Topic Receive, Service/Action history, 삭제 후 refresh, apply/build/import 상태
  표시 흐름을 기록한다.

### `docs/11_code_trace_index.md`

- 이 인계 문서 1~3절의 backend 파일·class·function·endpoint를 색인에 추가한다.
- frontend 경로는 class/function 검색으로 좁게 재확인한 뒤 정확한 실제 경로를 쓴다.
- 대형 파일의 모든 라인 번호는 갱신하지 말고 파일/클래스/함수를 우선한다.

### `docs/12_interface_lab_flow.md`

기존 초안을 완료본으로 취급하지 말고 현재 코드 기준으로 전면 재작성한다.
최소 목차:

1. 문서 목적
2. Interface Lab의 역할
3. 등록 방식 4종 비교
4. registry와 저장 위치
5. `manual_type`
6. `manual_definition`
7. `single_upload`
8. `package_upload`
9. CMakeLists.txt/package.xml 재생성
10. interface 0개 처리
11. apply/build/import
12. Service Call
13. Action Goal
14. exact `full_type`
15. Topic Receive
16. Service/Action history
17. frontend 동적 form
18. 삭제 생명주기
19. API 흐름
20. 전체 흐름 한 문장
21. 초보자가 자주 틀리는 부분
22. 내가 반드시 알아야 할 것 3줄 요약

## 13. 다음 세션의 제한적 재확인 목록

전체 코드 재조사 대신 아래만 필요할 때 검색한다.

1. `main.py`의 endpoint decorator와 처리 함수명.
2. frontend의 `useBrowserRoute`, `InterfaceLabPage`,
   `InterfaceUploadControl`, `RequestField`, merge 함수가 있는 정확한 경로.
3. package folder upload 함수의 정확한 Python 이름.
4. Action 종료 상태별 JSON field를 상세 표로 문서화할 경우 해당 result 조립부.
5. 단일 upload가 `uploaded_interfaces` 이외 package를 대상으로 하는 legacy metadata
   갱신 분기를 문서화할 경우 `_update_cmake`, `_update_package_xml`.

그 밖의 핵심 동작은 이전 조사에서 확인되었으므로 문서 수정부터 시작한다.
