# Service 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Service의 세 경로

Service는 목적에 따라 세 경로로 나뉜다.

1. **Service Graph 모니터링**: server/client 수와 상태를 관찰한다.
2. **Allowlist Active Check**: `monitor.yaml` allowlist에 있는 안전한 service만 background check를 수행한다.
3. **Interface Lab Service Call**: 사용자가 버튼을 눌렀을 때만 request를 ROS2 service server로 보낸다.

Service는 Topic처럼 계속 메시지가 흐르는 통신이 아니다. 그래서 "상태 관찰"과 "요청 전송"을 분리해야 한다. Dashboard의 Service 화면은 server/client 존재를 관찰하고, Interface Lab의 service-call만 실제 Request를 보낸다.

| 구분 | Graph 모니터링 | Active Check | Interface Lab Service Call |
|---|---|---|---|
| 시작점 | `RosMonitor` timer | ServiceRuntime update 뒤 allowlist만 | 사용자 버튼 클릭 |
| 대표 endpoint | `/ros/services` | 별도 직접 endpoint 없음 | `/ros/interfaces/service-call` |
| 구현 | `service/runtime.py` L24, L86 | `service/active_check_runtime.py` L19, L60 | `interface_lab/execution/service_call_runtime.py` L32, L85 |
| ROS2 요청 전송 | 안 함 | allowlist 안전 대상만 background 호출 | 사용자가 고른 service에만 전송 |

## 2. 모니터링 코드 추적

```text
RosMonitor timer
→ ServiceRuntime.update()
→ Graph API로 service/type/server/client 수집
→ ServiceActiveCheckRuntime.update()
→ snapshot/alert cache 제공
```

| 단계 | 코드 위치 |
|---|---|
| ServiceRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L24 |
| service snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L54 |
| Graph update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L86 |
| active check 연결 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` L129 |
| ServiceActiveCheckRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/active_check_runtime.py` L19 |
| active check update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/active_check_runtime.py` L60 |
| active check request 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/active_check.py` L211 |
| active check response preview | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/active_check.py` L216 |
| `/ros/services` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L43 |

## 3. Interface Lab Service Call 코드 추적

```text
Frontend request form
→ service execution router
→ ServiceCallRuntime.call_service()
→ callable exact match 확인
→ value_converter로 request 생성/검증
→ rclpy client call
→ response JSON 변환과 history 저장
```

| 단계 | 코드 위치 |
|---|---|
| callable services endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L14 |
| service-call endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L26 |
| call history endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L67 |
| receive service history endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L79 |
| receive service history reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/service_execution.py` L86 |
| ServiceCallRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L32 |
| callable service 판단 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L56 |
| service call 실행 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L85 |
| allowed service exact match | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/service_call_runtime.py` L262 |
| ROS request 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L37 |
| response JSON-safe 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L122 |

## 4. `/ros/services`를 라인으로 따라가기

```text
Frontend Service 화면
→ GET /ros/services
→ routers/monitoring.py L43 @router.get('/ros/services')
→ routers/monitoring.py L44 get_ros_services()
→ L48-L50 ros_monitor.service_snapshot(include_hidden=...)
→ ros_monitor.py L117 RosMonitor.service_snapshot()
→ service/runtime.py L54 ServiceRuntime.snapshot()
→ service/runtime.py L60-L79 service cache 복사와 meta 생성
→ ros_monitor.py L126-L144 ServiceCallRuntime summary/callable 정보 보강
→ routers/monitoring.py L51-L57 success/data JSON 반환
```

`include_hidden=true`는 숨김/내부 service까지 볼 때 쓰는 query parameter다. 기본값은 `False`이며, Router 선언은 `routers/monitoring.py` L45에 있다.

## 5. Service Graph 갱신을 라인으로 따라가기

```text
ros_monitor.py L531 _update_graph()
→ service/runtime.py L86 ServiceRuntime.update()
→ L88-L90 rclpy node가 없으면 빈 결과
→ L96 node.get_service_names_and_types()
→ L97-L102 include/exclude filter 적용
→ L104 service_type 선택
→ L109 node.count_services(name)로 server_count 계산
→ L110 _client_count(name)로 client_count 계산
→ L105-L119 build_service_item()
→ L123-L125 lock 안에서 cache 교체
→ L129-L134 update_active_checks()
```

이 단계는 REST 요청과 독립적으로 timer에서 수행된다.

## 6. Service Call을 라인으로 따라가기

```text
Frontend Interface Lab Service form
→ POST /ros/interfaces/service-call
→ routers/service_execution.py L26 endpoint
→ L27 call_registered_service()
→ L29-L45 JSON body와 service_name/service_type/request 검증
→ L48-L53 ros_monitor.call_service(...)
→ ros_monitor.py L151 RosMonitor.call_service()
→ interface_lab/execution/service_call_runtime.py L85 ServiceCallRuntime.call_service()
→ callable exact match 확인
→ value_converter.py L37 request object 생성
→ rclpy client call
→ value_converter.py L122 response JSON-safe 변환
→ history 저장
→ Router가 sent_to_server/response/error/timeout JSON 반환
```

## 7. 정책

- Graph 모니터링은 service를 임의 호출하지 않는다.
- Active Check는 allowlist에 있는 안전한 service만 background로 호출한다.
- Interface Lab Service Call은 registry/import 가능 상태와 Graph exact match가 모두 맞고 server가 있을 때만 callable이다.
- validation 실패 시 ROS2 server로 request를 보내지 않고 `sent_to_server=false`로 기록한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Service는 Graph 모니터링, allowlist active check, 사용자 Service Call이 분리되어 있다.
2. 사용자 Service Call은 `interface_lab/execution/service_call_runtime.py`가 담당한다.
3. 이름만 같아서는 안 되고 service name과 `full_type` exact match 및 server 존재가 필요하다.
