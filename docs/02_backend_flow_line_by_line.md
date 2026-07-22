# Backend 라인 추적 문서 안내

이 파일은 과거 상세 문서의 링크 호환을 위해 유지한다.

기존 내용은 Runtime 분리 전 라인 번호와 현재 코드가 충돌하여 제거했다.
현재 코드의 실제 라인 추적은 다음 기준 문서를 사용한다.

- 전체 시작/종료/Runtime 호출: `02_backend_flow.md`
- Topic: `03_topic_flow.md`
- Service: `04_service_flow.md`
- Action: `05_action_flow.md`
- Node: `06_node_flow.md`
- Alert: `07_alert_flow.md`
- WebSocket: `08_websocket_flow.md`

> 각 기준 문서의 라인 번호는 2026-07-21 현재 코드 기준이다.

## 현재 라인 추적을 읽는 순서

Backend 전체를 한 번에 읽기보다 아래 순서로 따라가면 이해하기 쉽다.

1. `02_backend_flow.md`: FastAPI app, router, `RosMonitor`가 어떻게 연결되는지 본다.
2. `03_topic_flow.md`: Topic 자동 모니터링과 Interface Lab Topic 실행이 왜 다른지 본다.
3. `04_service_flow.md`: Service Graph 관찰, allowlist active check, 사용자 service-call을 분리해서 본다.
4. `05_action_flow.md`: Action Graph/status/feedback/result 관찰과 사용자 action-goal 실행을 분리해서 본다.
5. `12_interface_lab_flow.md`: registry, package, apply, execution의 전체 생명주기를 본다.
6. `11_code_trace_index.md`: 특정 기능의 파일과 L 번호를 빠르게 찾는다.

대표 시작점은 다음과 같다.

| 읽고 싶은 것 | 시작 코드 위치 |
|---|---|
| 서버 시작과 router 등록 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` L21, L30, L40-L45 |
| ROS2 Graph 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L531 |
| Topic 목록 endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L16 |
| Service 목록 endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L43 |
| Action 목록 endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L60 |
| Node 목록 endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L73 |
| Interface apply endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/interface_apply.py` L25 |
