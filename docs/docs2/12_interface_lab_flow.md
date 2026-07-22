# Interface Lab 흐름 및 가이드

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. 문서 목적

Interface Lab은 커스텀 `.msg`, `.srv`, `.action`을 등록, 빌드, import 확인한 뒤 사용자가 명시적으로 Topic Publish/Receive, Service Call, Action Goal을 실행하는 도구다.

가장 중요한 구분은 등록, 적용, 실행이다.

```text
등록 management
→ registry/file/package 저장
→ 아직 ROS2에서 바로 쓸 수 있다는 뜻은 아님

적용 apply
→ colcon build
→ import-check
→ Backend reload 예약 가능

실행 execution
→ 사용자가 버튼 클릭
→ Topic Publish/Receive, Service Call, Action Goal 수행
```

## 2. 현재 책임 구조

| 영역 | 책임 | 코드 위치 |
|---|---|---|
| Router | FastAPI endpoint 접수, request 파싱, runtime/helper 호출 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/` |
| Management | registry, manual_type, manual_definition, single upload, package upload/delete, CMake/package.xml 재생성 | `interface_lab/management/` |
| Apply | apply status, colcon build, import-check, reload trigger | `interface_lab/apply/runtime.py` |
| Execution | Topic Publish/Receive, Service Call, Action Goal, history/cache/cleanup | `interface_lab/execution/` |
| Common | schema, validation, payload→ROS object, ROS object→JSON-safe 변환 | `interface_lab/common/value_converter.py` |

## 3. 등록 방식 4종

| 방식 | 입력 | 파일 생성 | 저장 위치 | build |
|---|---|---|---|---|
| manual_type | 이미 import 가능한 full_type | 없음 | `backend/config/interface_registry.yaml` | 불필요 |
| manual_definition | 사용자가 직접 쓴 정의 | 있음 | `backend/src/uploaded_interfaces/` | 필요 |
| single_upload | 단일 `.msg/.srv/.action` | 있음 | `backend/src/uploaded_interfaces/` | 필요 |
| package_upload | zip 또는 폴더 ROS interface package | 있음 | `backend/src/uploaded_interface_packages/` | 필요 |

`uploaded_interfaces`와 `uploaded_interface_packages`는 서로 다른 저장소다. 단일 interface 삭제가 package registry나 package 폴더를 건드리면 안 된다.

### 등록 방식별 실제 흐름

#### manual_type

- 영문 기능명: manual_type
- 한국어 직역: 수동 타입 등록
- 실제 의미: 이미 설치되어 import 가능한 `full_type` 문자열을 registry에 추가한다. 파일을 만들지 않는다.
- 사용 시점: 시스템에 이미 있는 `std_srvs/srv/SetBool` 같은 타입을 Interface Lab 후보에 올릴 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_management.py` L146, 처리 함수 `register_manual_interface_type()`은 L147에서 시작한다. helper는 `interface_lab/management/manual_interfaces.py` L55에서 시작한다.
- 흐름: Frontend → POST `/ros/interfaces/manual-type` → Router body 검증 → `register_manual_type()` → registry YAML 갱신 → JSON 반환

#### manual_definition

- 영문 기능명: manual_definition
- 한국어 직역: 수동 정의 작성
- 실제 의미: 사용자가 브라우저에서 `.msg/.srv/.action` 정의 내용을 직접 써서 `uploaded_interfaces` package에 파일로 저장한다.
- 사용 시점: 새 interface 파일을 따로 만들지 않고 UI에서 바로 정의를 실험할 때 사용한다.
- 코드 위치: 생성 endpoint는 `routers/interface_management.py` L171, 검증 L197, 수정 L222, 삭제 L247이다. helper는 `manual_interfaces.py` L92, L153, L170, L290에서 시작한다.
- 흐름: Frontend → definition 입력 → validate 또는 save → 파일/registry/CMake metadata 갱신 → apply 필요 상태 표시

#### single_upload

- 영문 기능명: single_upload
- 한국어 직역: 단일 파일 업로드
- 실제 의미: 사용자가 `.msg`, `.srv`, `.action` 파일 하나를 업로드해 `uploaded_interfaces` package에 저장한다.
- 사용 시점: 이미 작성된 interface 파일 하나를 Interface Lab에 등록할 때 사용한다.
- 코드 위치: endpoint는 `routers/interface_management.py` L40, 처리 함수 `upload_ros_interface()`는 L41에서 시작한다. helper는 `interface_lab/management/registry.py` L82에서 시작한다.
- 흐름: Frontend → multipart upload → Router request size 검사 → `extract_multipart_file()` → `register_interface()` → registry와 파일 저장 → JSON 반환

#### package_upload

- 영문 기능명: package_upload
- 한국어 직역: 패키지 업로드
- 실제 의미: 완성된 ROS2 interface package를 zip 또는 폴더 단위로 `uploaded_interface_packages` 아래에 보존한다.
- 사용 시점: 여러 msg/srv/action과 package.xml/CMakeLists.txt가 함께 있는 package를 통째로 추가할 때 사용한다.
- 코드 위치: zip endpoint는 `routers/interface_management.py` L276, folder endpoint는 L314이다. helper는 `interface_lab/management/packages.py` L63, L127에서 시작한다.
- 흐름: Frontend → zip/folder upload → package 구조 검증 → package registry 갱신 → apply 필요 상태 표시

## 4. 경로 계산 코드 추적

Interface Lab 데이터 경로는 모듈 위치가 아니라 backend workspace 기준으로 계산한다.

| 경로 | 코드 위치 |
|---|---|
| backend workspace root | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/paths.py` L8 |
| backend python package root | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/paths.py` L13 |
| reload trigger | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/paths.py` L23 |
| interface registry path | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L42 |
| default built-in interface package | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L51 |
| package registry path | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L42 |
| uploaded package root | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L51 |
| apply status path | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L57 |
| apply log path | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L66 |

## 5. Management 코드 추적

```text
management router
→ registry/manual/packages helper
→ 파일 저장 또는 YAML registry 갱신
→ 필요 시 uploaded_interfaces CMake/package.xml 재생성
→ mark_interface_change_pending()
```

| 기능 | 코드 위치 |
|---|---|
| single upload endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L40 |
| registry endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L88 |
| registry delete endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L102 |
| manual_type endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L146 |
| manual_definition create endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L171 |
| manual_definition validate endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L197 |
| manual_definition update endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L222 |
| manual_definition delete endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L247 |
| package upload endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L276 |
| folder package upload endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L314 |
| package list endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L350 |
| package delete endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L367 |
| single upload 구현 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L82 |
| registry snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L374 |
| registry delete 구현 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L381 |
| registry import 상태 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/registry.py` L439 |
| manual_type 등록 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L55 |
| manual_definition 작성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L92 |
| manual_definition 수정 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L153 |
| manual_definition 삭제 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L170 |
| uploaded interface 삭제 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L205 |
| definition validate | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L290 |
| uploaded_interfaces 파일 스캔 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L404 |
| uploaded_interfaces package 재생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L416 |
| CMakeLists.txt 재작성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L428 |
| package.xml 재작성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/manual_interfaces.py` L463 |
| zip package upload | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L63 |
| folder package upload | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L127 |
| package snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L223 |
| package delete | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L228 |
| package import 상태 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/management/packages.py` L276 |

### Management Router를 라인으로 따라가기

```text
단일 파일 업로드
→ routers/interface_management.py L40 endpoint
→ L41 upload_ros_interface()
→ L43-L56 request size 검사
→ L58-L61 multipart 추출 및 register_interface()
→ L68-L85 build 상태를 success/status/message로 변환

registry 조회
→ routers/interface_management.py L88 endpoint
→ L89 get_interface_registry()
→ L92 registry_snapshot()
→ L95-L99 interface_registry JSON 반환

삭제
→ routers/interface_management.py L102 endpoint
→ L103 delete_interface_registry_entry()
→ L111-L122 삭제 대상 entry/package 확인
→ uploaded_interfaces면 L124-L129 파일 삭제 및 pending 표시
→ 그 외 source면 L131-L136 registry entry만 삭제
```

## 6. Apply/build/import 코드 추적

```text
POST /ros/interfaces/apply
→ run_interface_apply()
→ colcon build --symlink-install
→ build log/status 저장
→ import-check
→ registry/package import_available 갱신
→ reload trigger 갱신
```

| 기능 | 코드 위치 |
|---|---|
| apply endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L25 |
| apply status endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L71 |
| import-check endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L85 |
| apply status 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L75 |
| pending 상태 기록 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L83 |
| apply/build 실행 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L100 |
| import-check 및 registry 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/apply/runtime.py` L500 |

### Apply를 라인으로 따라가기

```text
Frontend 적용하기 클릭
→ POST /ros/interfaces/apply
→ routers/interface_apply.py L25 endpoint
→ L26 apply_ros_interfaces()
→ L29 run_interface_apply()
→ interface_lab/apply/runtime.py L100 apply/build 실행
→ build log/status 저장
→ import-check 수행
→ 성공 시 routers/interface_apply.py L36 reload trigger background task 예약
→ L37-L47 성공 JSON 또는 L58-L68 실패 JSON 반환
```

`apply/status` 조회는 `routers/interface_apply.py` L71 → `apply_status()` L75 흐름이고, `import-check`는 `routers/interface_apply.py` L85 → `check_ros_interface_imports()` L86 → `run_import_check_and_update_registry()` L89 흐름이다.

## 7. Topic Publish/Receive 코드 추적

| 기능 | 코드 위치 |
|---|---|
| callable messages endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L14 |
| message schema endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L26 |
| topic publish endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L40 |
| receive start/stop/list/history/reset endpoints | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L99-L154 |
| runtime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L30 |
| schema | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L64 |
| callable messages | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L80 |
| receive start | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L113 |
| receive stop | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L167 |
| receive history/reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L205-L232 |
| publish | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L273 |
| publish history/reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L350-L357 |

### Topic 실행을 라인으로 따라가기

```text
callable messages
→ routers/topic_execution.py L14
→ get_callable_messages() L15
→ ros_monitor.callable_messages() L17
→ ros_monitor.py L294
→ topic_runtime.py L80

message schema
→ routers/topic_execution.py L26
→ get_message_schema() L27
→ ros_monitor.message_schema() L30
→ ros_monitor.py L298
→ topic_runtime.py L64

topic publish
→ routers/topic_execution.py L40
→ publish_registered_topic() L41
→ ros_monitor.publish_topic() L61-L65
→ ros_monitor.py L302
→ topic_runtime.py L273
```

## 8. Service Call 코드 추적

| 기능 | 코드 위치 |
|---|---|
| callable services endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L14 |
| service-call endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L26 |
| history endpoints | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L67-L86 |
| runtime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L32 |
| callable services | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L56 |
| service call | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L85 |
| allowed service | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L262 |

### Service Call을 라인으로 따라가기

```text
callable services
→ routers/service_execution.py L14
→ get_callable_services() L15
→ ros_monitor.callable_services() L17
→ ros_monitor.py L147
→ service_call_runtime.py L56

service-call
→ routers/service_execution.py L26
→ call_registered_service() L27
→ JSON body 검증 L29-L45
→ ros_monitor.call_service() L48-L53
→ ros_monitor.py L151
→ service_call_runtime.py L85
```

## 9. Action Goal 코드 추적

| 기능 | 코드 위치 |
|---|---|
| callable actions endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L14 |
| action-goal endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L26 |
| history endpoints | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L75-L94 |
| runtime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L37 |
| callable actions | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L61 |
| send goal | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L90 |
| allowed action | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L330 |

### Action Goal을 라인으로 따라가기

```text
callable actions
→ routers/action_execution.py L14
→ get_callable_actions() L15
→ ros_monitor.callable_actions() L17
→ ros_monitor.py L212
→ action_goal_runtime.py L61

action-goal
→ routers/action_execution.py L26
→ send_registered_action_goal() L27
→ JSON body 검증 L29-L53
→ ros_monitor.send_action_goal() L56-L61
→ ros_monitor.py L216
→ action_goal_runtime.py L90
```

## 10. 공통 schema/validation/conversion 코드 추적

| 기능 | 코드 위치 |
|---|---|
| ROS message/request/goal 객체 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L37 |
| field 재귀 할당 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L46 |
| primitive/array/nested 값 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L64 |
| ROS message JSON-safe 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L122 |
| schema 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L130 |

## 11. Frontend 코드 추적

| 기능 | 코드 위치 |
|---|---|
| Interface Lab page | `frontend/src/pages/InterfaceLabPage.jsx` L6 |
| 초기 데이터 fetch | `frontend/src/pages/InterfaceLabPage.jsx` L78-L85 |
| page 내부 topic publish/start/stop | `frontend/src/pages/InterfaceLabPage.jsx` L263-L300 |
| 작업 도구 component | `frontend/src/components/InterfaceUploadControl.jsx` L43 |
| 작업 도구 데이터 refresh | `frontend/src/components/InterfaceUploadControl.jsx` L515-L519 |
| 작업 도구 topic receive start/stop | `frontend/src/components/InterfaceUploadControl.jsx` L571-L585 |
| 작업 도구 topic publish | `frontend/src/components/InterfaceUploadControl.jsx` L625 |
| callable message API | `frontend/src/api/rosApi.js` L94 |
| topic publish API | `frontend/src/api/rosApi.js` L139 |
| receive topic start/stop API | `frontend/src/api/rosApi.js` L293-L302 |
| receive topic history API | `frontend/src/api/rosApi.js` L315 |

## 12. 정책

- `manual_type`은 파일 생성과 build가 필요 없는 registry 등록 방식이다.
- 파일 생성/삭제와 CMake/package.xml 재생성은 management 책임이다.
- apply runtime은 build/apply/import/status만 담당한다.
- execution runtime은 registry/schema를 조회할 수 있지만 interface 파일 생성, 삭제, build를 직접 수행하지 않는다.
- Service/Action callable은 registry/package 등록, import 가능, Graph exact match, server 존재가 모두 맞아야 한다.
- validation 실패 시 Topic Publish, Service Call, Action Goal 모두 ROS2 전송을 차단한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Interface Lab 구현은 `management`, `apply`, `execution`, `common`으로 나뉘며 router는 얇은 API 계층이다.
2. 사용자 데이터 경로는 backend workspace 기준으로 유지하고, 모듈 이동 위치에 의존하지 않는다.
3. Topic/Service/Action 실행은 사용자가 명시적으로 누른 경우에만 수행되며 `full_type` exact match를 보존한다.
