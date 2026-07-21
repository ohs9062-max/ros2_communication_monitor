# Service 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Service의 세 경로

Service는 목적에 따라 세 경로로 나뉜다.

1. **Service Graph 모니터링**: server/client 수와 상태를 관찰한다.
2. **Allowlist Active Check**: `monitor.yaml` allowlist에 있는 안전한 service만 background check를 수행한다.
3. **Interface Lab Service Call**: 사용자가 버튼을 눌렀을 때만 request를 ROS2 service server로 보낸다.

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

## 4. 정책

- Graph 모니터링은 service를 임의 호출하지 않는다.
- Active Check는 allowlist에 있는 안전한 service만 background로 호출한다.
- Interface Lab Service Call은 registry/import 가능 상태와 Graph exact match가 모두 맞고 server가 있을 때만 callable이다.
- validation 실패 시 ROS2 server로 request를 보내지 않고 `sent_to_server=false`로 기록한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Service는 Graph 모니터링, allowlist active check, 사용자 Service Call이 분리되어 있다.
2. 사용자 Service Call은 `interface_lab/execution/service_call_runtime.py`가 담당한다.
3. 이름만 같아서는 안 되고 service name과 `full_type` exact match 및 server 존재가 필요하다.
