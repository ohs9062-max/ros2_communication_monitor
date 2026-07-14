# Action 모니터링 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

Action 발견, server/client count, status/feedback 구독, observed goal cache,
제한적 result 조회, REST와 Alert 흐름을 설명한다.

`ActionRuntime`이 Action Graph와 event subscription을 소유하고,
`ActionResultRuntime`은 status에서 관찰된 terminal Goal만 조회한다.

## 2. 전체 흐름

```text
Action Graph discovery/count
→ status/feedback subscription
→ callback이 goal/runtime cache 갱신
→ terminal observed goal 선별
→ get_result call_async
→ /ros/actions snapshot과 Alert
```

## 3. Graph와 subscription 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | ActionResultRuntime 조립 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/runtime.py` | L35-L59 | `ActionRuntime.__init__` |
| 2 | names/types와 count map 조회 | 같은 파일 | L84-L104 | `ActionRuntime.update` |
| 3 | Action 목록 Graph API | 같은 파일 | L159-L168 | `_action_names_and_types` |
| 4 | Node별 server/client count 합산 | 같은 파일 | L170-L256 | `_action_count_maps` 외 |
| 5 | subscription entry 생성/재사용 | 같은 파일 | L258-L302 | `_ensure_subscriptions` |
| 6 | status subscription 생성 | 같은 파일 | L325-L357 | `_maybe_create_status_subscription` |
| 7 | feedback subscription 생성 | 같은 파일 | L359-L397 | `_maybe_create_feedback_subscription` |
| 8 | status callback | 같은 파일 | L403-L417 | `_status_callback` |
| 9 | feedback callback | 같은 파일 | L419-L433 | `_feedback_callback` |
| 10 | 사라진 Action subscription 정리 | 같은 파일 | L435-L455 | `_cleanup_disappeared_subscriptions` |
| 11 | public snapshot/meta | 같은 파일 | L70-L82 | `snapshot` |

status callback은 `action/subscriptions.py` L122-L162의
`update_status_runtime`으로 Goal별 상태, `last_goal_id`, elapsed time,
`observed_goal_count`를 갱신한다. feedback은 L165-L175에서 JSON-safe preview로
저장한다.

## 4. Result 조회 정책

| 단계 | 설명 | 파일 | 라인 | 함수 |
|---|---|---|---|---|
| 1 | result 지원 여부/정책 계산 | `backend/.../action/result_runtime.py` | L69-L80 | `support` |
| 2 | 완료 future 처리 후 새 요청 검사 | 같은 파일 | L82-L100 | `update`, `_complete_action_result_futures` |
| 3 | terminal이며 미요청 Goal만 선별 | `backend/.../action/subscriptions.py` | L177-L186 | `terminal_goals_ready_for_result` |
| 4 | observed Goal request 생성/호출 | `backend/.../action/result_runtime.py` | L102-L173 | `_maybe_start_action_result_requests` |
| 5 | 결과/오류를 Goal cache에 반영 | 같은 파일 | L175-L223 | `_record_action_result_done`, `_record_action_result_error` |
| 6 | get_result client 생성 | 같은 파일 | L225-L239 | `_action_result_client` |
| 7 | Action type에서 service class 로드 | 같은 파일 | L241-L262 | `_result_service_class` |

`observed_goal_only`는 임의 Goal ID를 생성하거나 찾는 정책이 아니다.
status topic에서 실제로 본 Goal 중 terminal 상태이고 아직 result를 요청하지 않은
Goal만 대상으로 한다. Goal/cancel 전송 기능은 없다.

## 5. REST, Alert, Frontend 연결

- REST: `main.py` L98-L108 `get_ros_actions`
- coordinator: `ros_monitor.py` L109-L111 `action_snapshot`
- Alert: `action/alerts.py` L18-L63 `build_action_alerts`
- aborted/canceled/result_error만 Alert: `action/alerts.py` L25-L61
- API 호출: `rosApi.js` L47-L49
- polling/participant map: `useActionDashboard.js` L9-L73
- page filter/선택: `ActionsPage.jsx` L16-L174
- 표/상세: `ActionTable.jsx` L38-L116,
  `ActionDetailPanel.jsx` L5-L195

Goal 미관찰, waiting server, result policy 안내는 상태 정보이며 기본 Alert가 아니다.

## 6. 발표 때 설명할 문장

“대시보드는 Action Goal을 보내지 않고 status와 feedback을 관찰합니다.
Result도 status에서 실제로 관찰한 종료 Goal에 대해서만 제한적으로 조회합니다.”

## 7. 헷갈리기 쉬운 부분

- Action 하나는 내부적으로 status/feedback Topic과 여러 Service를 사용한다.
- `server_count`와 `client_count`는 Node별 Action Graph 결과를 합산한다.
- Feedback type import가 실패하면 Action 자체가 실패한 것이 아니다.
- `result_status=pending`은 result 조회 중이지 Goal 실패 상태가 아니다.

## 8. 관련 파일 빠른 참조

`action/runtime.py`, `action/subscriptions.py`, `action/result_runtime.py`,
`action/result.py`, `action/discovery.py`, `action/models.py`,
`action/alerts.py`, `frontend/src/pages/ActionsPage.jsx`
