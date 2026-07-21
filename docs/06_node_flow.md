# Node 모니터링 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Node 이름보다 관계가 중요한 이유

Node 목록만으로는 각 프로그램이 무엇을 발행하고 요청하는지 알기 어렵다. `NodeRuntime`은 Node별 Topic, Service, Action 관계를 함께 조사한다. 현재 Graph에서 사라진 Node는 바로 버리지 않고 설정 시간 동안 `stale` 상태로 남긴다.

## 2. Node 관계 cache 코드 추적

```text
RosMonitor._update_graph()
→ NodeRuntime.update()
→ node name/namespace 조회
→ topic/service/action 관계 조회
→ build_node_item()으로 public item 조립
→ snapshot 제공
```

| 단계 | 코드 위치 |
|---|---|
| graph update 진입 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L531 |
| NodeRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` L25 |
| node snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` L54 |
| node update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` L69 |
| node item 조립 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/discovery.py` L14 |
| stale item 조립 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/discovery.py` L58 |
| RosMonitor node snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` L332 |
| `/ros/nodes` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L73 |

## 3. Frontend 관계 역매핑 코드 추적

Backend는 Node 기준 관계를 반환하고, Frontend가 이를 Topic/Service/Action 상세 패널용 participant map으로 뒤집는다.

| 단계 | 코드 위치 |
|---|---|
| Node dashboard hook | `frontend/src/hooks/useNodeDashboard.js` L8 |
| Nodes page | `frontend/src/pages/NodesPage.jsx` L6 |
| participant map 생성 | `frontend/src/utils/participants.js` L1 |
| internal node 판단 | `frontend/src/utils/nodeFilters.js` L22 |
| primary node 판단 | `frontend/src/utils/nodeFilters.js` L28 |

## 4. 정책

- stale은 process 종료를 직접 확인한 값이 아니라 ROS2 Graph에서 사라진 Node를 일정 시간 보존한 상태다.
- 관계 count는 Hz나 처리량이 아니라 현재 Graph 관계 배열의 개수다.
- “주요 Node” 분류는 Backend 수집 정책이 아니라 Frontend 표시 정책이다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Node API는 이름뿐 아니라 Topic, Service, Action 관계를 함께 제공한다.
2. 사라진 Node는 timeout 동안 stale로 남았다가 제거된다.
3. Frontend는 Node 관계를 역매핑해 각 통신 상세의 실제 참여자를 표시한다.
