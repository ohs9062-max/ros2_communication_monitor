# Node 모니터링 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Node 이름보다 관계가 중요한 이유

Node 목록만으로는 각 프로그램이 무엇을 발행하고 요청하는지 알기 어렵다. `NodeRuntime`은 Node별 Topic, Service, Action 관계를 함께 조사한다. 현재 Graph에서 사라진 Node는 바로 버리지 않고 설정 시간 동안 `stale` 상태로 남긴다.

이 프로젝트에서 Node는 단순한 이름 목록이 아니라 "통신 관계의 기준점"이다. Frontend는 `/ros/nodes` 응답을 이용해 Topic의 발행자/구독자, Service의 요청자/응답자, Action의 Goal 요청자/실행자를 역으로 계산한다.

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

## 4. `/ros/nodes`를 라인으로 따라가기

```text
Frontend Node 화면 또는 Visualization 화면
→ GET /ros/nodes
→ routers/monitoring.py L73 @router.get('/ros/nodes')
→ routers/monitoring.py L74 get_ros_nodes()
→ L76 ros_monitor.node_snapshot()
→ ros_monitor.py L332 RosMonitor.node_snapshot()
→ node/runtime.py L54 NodeRuntime.snapshot()
→ node/runtime.py L56-L58 lock 안에서 node cache 복사
→ node/runtime.py L60 이름 기준 정렬
→ node/runtime.py L61-L67 nodes/meta 반환
→ routers/monitoring.py L77-L83 success/data JSON 반환
```

이 흐름은 Node 관계를 새로 스캔하지 않는다. 이미 timer가 만들어 둔 NodeRuntime cache를 읽는 조회 흐름이다.

## 5. Node Graph 갱신을 라인으로 따라가기

```text
ros_monitor.py L531 _update_graph()
→ node/runtime.py L69 NodeRuntime.update()
→ L71-L73 rclpy node 없으면 빈 결과
→ L76 get_node_names_and_namespaces()
→ L79-L87 include/exclude filter 적용
→ L89-L127 build_node_item() 입력 조립
→ L92-L103 publisher/subscriber 관계 조회
→ L104-L115 service server/client 관계 조회
→ L116-L125 action server/client 관계 조회
→ L130-L140 사라진 node를 stale로 보존할지 판단
→ L142-L147 cache 교체 후 정렬된 목록 반환
```

`stale`은 프로세스 종료를 직접 확인했다는 뜻이 아니다. ROS2 Graph에서 사라진 Node를 `stale_timeout_sec` 동안 잠시 남겨서 화면이 갑자기 사라지는 것을 완화하는 표시다.

## 6. Frontend participant map 흐름

```text
/ros/nodes 응답
→ frontend/src/utils/participants.js L1
→ Node 기준 관계를 Topic/Service/Action 기준으로 뒤집음
→ Topic 상세: 발행자 Node / 구독자 Node
→ Service 상세: 응답자 Node / 요청자 Node
→ Action 상세: Goal 실행자 Node / Goal 요청자 Node
```

Backend API 응답 구조를 바꾸지 않고 Frontend에서 가공한다는 점이 핵심이다.

## 7. 정책

- stale은 process 종료를 직접 확인한 값이 아니라 ROS2 Graph에서 사라진 Node를 일정 시간 보존한 상태다.
- 관계 count는 Hz나 처리량이 아니라 현재 Graph 관계 배열의 개수다.
- “주요 Node” 분류는 Backend 수집 정책이 아니라 Frontend 표시 정책이다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Node API는 이름뿐 아니라 Topic, Service, Action 관계를 함께 제공한다.
2. 사라진 Node는 timeout 동안 stale로 남았다가 제거된다.
3. Frontend는 Node 관계를 역매핑해 각 통신 상세의 실제 참여자를 표시한다.
