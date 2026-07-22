# Action Monitor Flow 문서 안내

이 파일은 과거 링크 호환을 위해 유지한다.

기존 본문은 `ActionRuntime` 분리 전 `ros_monitor.py`의 메서드명과 현재 Alert
정책이 섞여 있어 기준 문서와 충돌했다. 현재 코드 기준 설명은 다음 문서로
통합했다.

- Action Graph/status/feedback/result: `05_action_flow.md`
- Action Alert 정책과 통합: `07_alert_flow.md`
- Frontend Actions 화면: `09_frontend_flow.md`
- 기능별 빠른 위치: `11_code_trace_index.md`

> 위 문서의 라인 번호는 2026-07-21 현재 코드 기준이다.

## 현재 코드에서 Action Monitor를 따라가는 시작점

이 파일 이름 때문에 "Action만 따로 monitor하는 큰 파일"이 있을 것처럼 보일 수 있지만, 현재 구조에서는 Action 관련 책임이 나뉘어 있다.

| 알고 싶은 내용 | 현재 기준 문서 | 실제 코드 시작 위치 |
|---|---|---|
| `/ros/actions` endpoint | `05_action_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L60 |
| Action snapshot 조립 | `05_action_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L187 |
| ActionRuntime cache | `05_action_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` L35, L70, L84 |
| status/feedback subscription | `05_action_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/subscriptions.py` L122, L165 |
| observed result 조회 | `05_action_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py` L20, L82 |
| 사용자 Goal 전송 | `12_interface_lab_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/action_execution.py` L26 |
| Goal runtime | `12_interface_lab_flow.md` | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/action_goal_runtime.py` L37, L90 |

요약 흐름:

```text
Action 모니터링
→ /ros/actions
→ monitoring.py L60
→ ros_monitor.py L187
→ action/runtime.py L70 snapshot

사용자 Action Goal 실행
→ /ros/interfaces/action-goal
→ action_execution.py L26
→ ros_monitor.py L216
→ action_goal_runtime.py L90
```

첫 번째 흐름은 관찰만 하고 Goal을 보내지 않는다. 두 번째 흐름은 사용자가 Interface Lab에서 실행했을 때만 Goal을 보낸다.
