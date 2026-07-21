# Action 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Action의 두 경로

Action은 자동 관찰과 사용자 명시 실행으로 나뉜다.

1. **Action 모니터링**: action server/client, status, feedback, 관찰된 goal result를 본다.
2. **Interface Lab Action Goal**: 사용자가 버튼을 눌렀을 때만 goal을 전송하고 feedback/result history를 저장한다.

## 2. Action 모니터링 코드 추적

```text
RosMonitor timer
→ ActionRuntime.update()
→ Graph API로 action server/client 수집
→ status/feedback subscription 유지
→ ActionResultRuntime이 관찰된 terminal goal result만 조회
→ snapshot/alert cache 제공
```

| 단계 | 코드 위치 |
|---|---|
| ActionRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L35 |
| action snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L70 |
| Graph update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L84 |
| feedback callback | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L419 |
| status runtime 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/subscriptions.py` L122 |
| feedback runtime 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/subscriptions.py` L165 |
| goal result 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/subscriptions.py` L204 |
| ActionResultRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py` L20 |
| result update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py` L82 |
| `/ros/actions` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L60 |

## 3. Interface Lab Action Goal 코드 추적

```text
Frontend goal form
→ action execution router
→ ActionGoalRuntime.send_goal()
→ callable exact match 확인
→ value_converter로 goal 생성/검증
→ rclpy ActionClient send_goal
→ feedback/result JSON 변환과 history 저장
```

| 단계 | 코드 위치 |
|---|---|
| callable actions endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L14 |
| action-goal endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L26 |
| goal history endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L75 |
| receive action history endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L87 |
| receive action history reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L94 |
| ActionGoalRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L37 |
| callable action 판단 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L61 |
| goal 전송 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L90 |
| allowed action exact match | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L330 |
| ROS goal 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L37 |
| feedback/result JSON 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L122 |

## 4. 정책

- Action 모니터링은 goal을 새로 만들지 않는다.
- `ActionResultRuntime`은 status에서 관찰된 terminal goal만 result 조회 대상으로 삼는다.
- Interface Lab Action Goal은 사용자가 명시 실행한 경우에만 goal을 보낸다.
- `ActionClient` cache key는 `(action_name, action_type)` 쌍이다.
- validation 실패 시 ROS2 action server로 goal을 보내지 않고 `sent_to_server=false`로 기록한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Action 모니터링과 Interface Lab Goal 전송은 분리되어 있다.
2. 사용자 Goal 전송은 `(action_name, full_type)` exact match 기준으로만 callable이다.
3. 모니터링 status/feedback cache와 Interface Lab goal history는 별도 데이터다.
