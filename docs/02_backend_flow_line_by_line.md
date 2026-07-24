# Backend 코드 읽기 안내

과거의 고정 줄 번호 설명은 코드 변경 때마다 실제 위치와 달라져 제거했다.

Backend 전체 실행 순서는 [02_backend_flow.md](02_backend_flow.md), 최신 파일과 함수 시작점은 [11_code_trace_index.md](11_code_trace_index.md)를 사용한다.

읽는 순서는 다음이 가장 짧다.

```text
main.py lifespan
→ app_state.py
→ RosMonitor.start()
→ RosMonitor._update_graph()
→ 각 Runtime.update()
→ router의 snapshot 응답
→ RosMonitor.stop()
```
