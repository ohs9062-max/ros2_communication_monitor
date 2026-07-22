# 기능별 코드 위치 빠른 색인

> 라인 번호는 2026-07-21 실제 코드 기준이다. 함수명은 실제 코드 기준이며 추측 이름을 사용하지 않는다.

## 0. 이 색인을 읽는 법

이 문서는 자세한 설명보다 "어디서 시작하는지"를 빨리 찾기 위한 지도다. endpoint를 찾을 때는 decorator 줄과 처리 함수 줄을 함께 본다. 예를 들어 `/ros/topics`는 `routers/monitoring.py` L16의 `@router.get('/ros/topics')`에서 endpoint가 선언되고, 바로 다음 L17의 `get_ros_topics()`가 실제 처리 함수다.

일반적인 추적 순서는 다음과 같다.

```text
Frontend API 함수
→ Backend router endpoint
→ router 처리 함수
→ ros_monitor public method 또는 interface_lab helper
→ domain runtime/helper
→ JSON 응답
```

Monitoring 조회는 runtime cache를 읽고, Interface Lab execution은 사용자가 명시 실행한 요청만 ROS2로 전송한다.

## 1. Backend app과 router

| 기능 | 코드 위치 |
|---|---|
| FastAPI lifespan | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L21 |
| app 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L30 |
| router 등록 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L40-L45 |
| health | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L49 |
| monitoring router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L16-L93 |
| interface management router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_management.py` L40-L367 |
| interface apply router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L25-L85 |
| topic execution router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L14-L154 |
| service execution router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L14-L86 |
| action execution router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L14-L94 |

## 2. RosMonitor와 자동 모니터링

| 기능 | 코드 위치 |
|---|---|
| RosMonitor start | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L74 |
| RosMonitor stop | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L90 |
| graph update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L531 |
| TopicRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L41 |
| ServiceRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L24 |
| ActionRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L35 |
| ActionResultRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py` L20 |
| NodeRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` L25 |
| Alert 통합 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L376 |
| WebSocket snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L336 |

## 3. Interface Lab management

| 기능 | 코드 위치 |
|---|---|
| single upload 등록 | `interface_lab/management/registry.py` L82 |
| registry snapshot | `interface_lab/management/registry.py` L374 |
| registry delete | `interface_lab/management/registry.py` L381 |
| registry import 상태 갱신 | `interface_lab/management/registry.py` L439 |
| manual_type 등록 | `interface_lab/management/manual_interfaces.py` L55 |
| manual_definition 작성 | `interface_lab/management/manual_interfaces.py` L92 |
| manual_definition 수정 | `interface_lab/management/manual_interfaces.py` L153 |
| manual_definition 삭제 | `interface_lab/management/manual_interfaces.py` L170 |
| uploaded interface 삭제 | `interface_lab/management/manual_interfaces.py` L205 |
| definition validate | `interface_lab/management/manual_interfaces.py` L290 |
| uploaded_interfaces 파일 스캔 | `interface_lab/management/manual_interfaces.py` L404 |
| uploaded_interfaces package 재생성 | `interface_lab/management/manual_interfaces.py` L416 |
| CMakeLists.txt 재작성 | `interface_lab/management/manual_interfaces.py` L428 |
| package.xml 재작성 | `interface_lab/management/manual_interfaces.py` L463 |
| package zip upload | `interface_lab/management/packages.py` L63 |
| package folder upload | `interface_lab/management/packages.py` L127 |
| package snapshot | `interface_lab/management/packages.py` L223 |
| package delete | `interface_lab/management/packages.py` L228 |
| package import 상태 갱신 | `interface_lab/management/packages.py` L276 |

## 4. Interface Lab apply

| 기능 | 코드 위치 |
|---|---|
| apply status 조회 | `interface_lab/apply/runtime.py` L75 |
| pending 상태 기록 | `interface_lab/apply/runtime.py` L83 |
| colcon build 실행 | `interface_lab/apply/runtime.py` L100 |
| import-check 및 registry/package 갱신 | `interface_lab/apply/runtime.py` L500 |
| backend workspace root | `interface_lab/paths.py` L8 |
| reload trigger path | `interface_lab/paths.py` L23 |
| apply status path | `interface_lab/apply/runtime.py` L57 |
| apply log path | `interface_lab/apply/runtime.py` L66 |

## 5. Interface Lab execution

| 기능 | 코드 위치 |
|---|---|
| Topic runtime | `interface_lab/execution/topic_runtime.py` L30 |
| Message schema | `interface_lab/execution/topic_runtime.py` L64 |
| callable messages | `interface_lab/execution/topic_runtime.py` L80 |
| Topic receive start | `interface_lab/execution/topic_runtime.py` L113 |
| Topic receive stop | `interface_lab/execution/topic_runtime.py` L167 |
| Topic receive history/reset | `interface_lab/execution/topic_runtime.py` L205-L232 |
| Topic publish | `interface_lab/execution/topic_runtime.py` L273 |
| Topic publish history/reset | `interface_lab/execution/topic_runtime.py` L350-L357 |
| ServiceCallRuntime | `interface_lab/execution/service_call_runtime.py` L32 |
| callable services | `interface_lab/execution/service_call_runtime.py` L56 |
| service call | `interface_lab/execution/service_call_runtime.py` L85 |
| allowed service | `interface_lab/execution/service_call_runtime.py` L262 |
| ActionGoalRuntime | `interface_lab/execution/action_goal_runtime.py` L37 |
| callable actions | `interface_lab/execution/action_goal_runtime.py` L61 |
| action goal send | `interface_lab/execution/action_goal_runtime.py` L90 |
| allowed action | `interface_lab/execution/action_goal_runtime.py` L330 |

## 6. 공통 schema/validation/conversion

| 기능 | 코드 위치 |
|---|---|
| ROS message/request/goal 객체 생성 | `interface_lab/common/value_converter.py` L37 |
| field 재귀 할당 | `interface_lab/common/value_converter.py` L46 |
| primitive/array/nested 변환 | `interface_lab/common/value_converter.py` L64 |
| ROS message JSON-safe 변환 | `interface_lab/common/value_converter.py` L122 |
| schema 생성 | `interface_lab/common/value_converter.py` L130 |

## 7. Frontend 핵심 위치

| 기능 | 코드 위치 |
|---|---|
| API 함수 모음 | `frontend/src/api/rosApi.js` L1 |
| WebSocket URL | `frontend/src/api/rosApi.js` L15 |
| Topic latest/hz API | `frontend/src/api/rosApi.js` L49-L53 |
| 공통 polling hook | `frontend/src/hooks/usePolling.js` L3 |
| Topic dashboard hook | `frontend/src/hooks/useTopicDashboard.js` L16 |
| Service dashboard hook | `frontend/src/hooks/useServiceDashboard.js` L9 |
| Action dashboard hook | `frontend/src/hooks/useActionDashboard.js` L9 |
| Node dashboard hook | `frontend/src/hooks/useNodeDashboard.js` L8 |
| WebSocket hook | `frontend/src/hooks/useMonitorWebSocket.js` L6 |
| Interface Lab page | `frontend/src/pages/InterfaceLabPage.jsx` L6 |
| Interface Lab 작업 도구 | `frontend/src/components/InterfaceUploadControl.jsx` L43 |
| Visualization graph hook | `frontend/src/hooks/useVisualizationGraph.js` L19 |
| graph 변환 | `frontend/src/utils/graphTransform.js` L18 |

## 8. 핵심 개념 매핑

- `main.py`는 app 조립 중심이고 endpoint 구현은 `routers/`에 있다.
- single/manual registry는 `backend/config/interface_registry.yaml`, package registry는 `backend/config/interface_packages.yaml`이다.
- Interface Lab 데이터 경로는 `backend_workspace_root()` 기준으로 유지한다.
- Topic Publish/Receive key는 `(topic_name, full_type)`이다.
- Service/Action callable은 registry/package 등록, import 가능, Graph exact match, server 존재를 모두 만족해야 한다.
- validation 실패 시 Topic/Service/Action 모두 ROS2 전송을 차단한다.
