# Action 모니터링 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Action을 관찰하는 범위

Action은 오래 걸리는 작업을 Goal, 진행 Feedback, Result로 나눕니다. 이
대시보드는 장비를 움직일 수 있는 Goal이나 cancel을 보내지 않습니다.
`ActionRuntime`이 Action server/client와 status/feedback을 관찰하고,
`ActionResultRuntime`은 status에서 실제로 본 종료 Goal만 result를 조회합니다.

## 2. Action 발견과 목록 cache

```text
RosMonitor가 Action 갱신 호출
  — ros_monitor.py L304-L308
  — RosMonitor._update_graph() → ActionRuntime.update()

→ Action 이름과 type 조회
  — action/runtime.py L84-L104, L159-L168
  — rclpy.action.graph.get_action_names_and_types()

→ Node별 server/client 관계를 합산
  — action/runtime.py L170-L256
  — _action_count_maps() 외 Graph reader

→ status/feedback subscription 생성 또는 재사용
  — action/runtime.py L258-L302
  — _ensure_subscriptions()

→ Graph 상태와 관찰 runtime을 Action item으로 조립
  — action/runtime.py L105-L125
  — action/discovery.py L23-L68, build_action_item()

→ Action 목록 cache 저장
  — action/runtime.py L127-L137
```

`ActionRuntime.update()`는 `node_getter()`로 Node를 얻고, Action name/type과 Node별
server/client count를 사용합니다. Action 하나의 내부 status/feedback Topic과 여러
Service는 `/ros/actions`에서 하나의 Action item으로 묶입니다.

## 3. status와 feedback 수신

```text
status subscription 생성
  — action/runtime.py L325-L357
  — _maybe_create_status_subscription()

→ status 메시지 도착 시 callback 실행
  — action/runtime.py L403-L417
  — _status_callback(name)

→ Goal ID별 상태, 시간, observed count 저장
  — action/subscriptions.py L122-L162
  — update_status_runtime()

feedback subscription과 callback
  — action/runtime.py L359-L397, L419-L433

→ JSON-safe feedback preview 저장
  — action/subscriptions.py L165-L175
  — update_feedback_runtime()
```

status callback은 Action 이름과 실제 `GoalStatusArray` 메시지를 전달받습니다.
Goal별 accepted/executing/finished 시각과 elapsed time은 subscription runtime
cache에 저장됩니다. feedback type을 import할 수 없으면 preview가 제한될 뿐 Action
server 실패로 판단하지 않습니다.

## 4. 관찰한 Goal의 Result 조회

```text
ActionRuntime이 ActionResultRuntime.update(actions) 호출
  — action/runtime.py L118-L125
  — result_runtime.py L82-L100

→ status에서 본 terminal Goal 중 미요청 항목 선택
  — action/subscriptions.py L177-L186
  — terminal_goals_ready_for_result()

→ 관찰한 Goal ID로 get_result request 생성
  — action/result_runtime.py L102-L173
  — _maybe_start_action_result_requests()

→ call_async() Future 완료 결과 저장
  — action/result_runtime.py L88-L100, L175-L223

→ result_preview/result_status/result_error를 Action item에 반영
  — action/subscriptions.py L204-L217, L283-L292
```

`observed_goal_only`는 임의 Goal ID를 만들거나 새 Goal을 보내는 정책이 아닙니다.
status Topic에서 확인한 terminal Goal만 사용합니다. `result_status=pending`은 Goal
실패가 아니라 result 응답을 기다리는 상태입니다.

## 5. REST, Alert, 화면 전달

```text
ActionRuntime.snapshot()
  — action/runtime.py L70-L82
→ RosMonitor.action_snapshot()
  — ros_monitor.py L109-L111
→ GET /ros/actions
  — main.py L98-L108
→ Frontend polling과 화면
  — rosApi.js L47-L49
  — useActionDashboard.js L9-L73
  — ActionsPage.jsx L16-L174
```

`build_action_alerts()`는 `action/alerts.py` L18-L63에서 aborted, canceled,
result lookup error만 Alert로 만듭니다. Goal 미관찰과 waiting server는 상태 정보이며
기본 Alert가 아닙니다.

## 6. 전체 흐름 한 문장

ActionRuntime이 Graph와 status/feedback callback으로 Goal을 관찰하고, 실제로 본
종료 Goal만 result 조회한 뒤 REST와 Alert에 전달합니다.

## 초보자가 자주 틀리는 부분

- Action server가 보여도 Goal이 실행되었다는 뜻은 아닙니다.
- 이 Backend는 Goal과 cancel을 보내지 않습니다.
- Result 조회는 status에서 관찰한 Goal ID로만 제한됩니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Action 목록과 참여자는 `rclpy.action.graph`로 찾습니다.
2. status/feedback callback이 Goal runtime cache를 갱신합니다.
3. 관찰한 terminal Goal만 result를 조회하며 새 Goal은 만들지 않습니다.
