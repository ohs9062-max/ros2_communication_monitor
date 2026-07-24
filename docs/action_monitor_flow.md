# Action Monitoring 빠른 안내

Action의 최신 기준 문서는 [05_action_flow.md](05_action_flow.md)다.

코드를 바로 추적하려면 [11_code_trace_index.md](11_code_trace_index.md)의 Action 절에서 다음 순서로 읽는다.

```text
action/runtime.py
→ action/subscriptions.py
→ action/result_runtime.py
→ action/alerts.py
```

사용자가 Goal을 보내는 경로는 Monitoring과 다르며 `interface_lab/execution/action_goal_runtime.py`가 담당한다.
