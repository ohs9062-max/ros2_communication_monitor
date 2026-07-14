# Node 모니터링 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Node 이름보다 관계가 중요한 이유

Node 목록만으로는 각 프로그램이 무엇을 발행하고 요청하는지 알기 어렵습니다.
`NodeRuntime`은 Node별 Topic, Service, Action 관계를 함께 조사합니다. 현재 Graph에서
사라진 Node는 바로 버리지 않고 설정 시간 동안 `stale` 상태로 남겨 갑작스러운
종료 흔적을 화면에서 볼 수 있게 합니다.

## 2. Node 관계 cache 만들기

```text
RosMonitor가 Node 갱신을 가장 먼저 호출
  — ros_monitor.py L304-L305
  — RosMonitor._update_graph() → NodeRuntime.update()

→ Node 이름과 namespace 조회
  — node/runtime.py L69-L87, L150-L156
  — get_node_names_and_namespaces()

→ 각 Node의 Topic publisher/subscriber 조회
  — node/runtime.py L89-L103, L158-L174

→ Service server/client 조회
  — node/runtime.py L104-L115, L158-L174

→ Action server/client 조회
  — node/runtime.py L116-L125, L177-L215

→ 관계 배열과 count를 public item으로 조립
  — node/discovery.py L14-L55
  — build_node_item()

→ 현재 목록과 마지막 관찰 시각을 cache에 저장
  — node/runtime.py L130-L147
```

`NodeRuntime.update()`는 인자를 받지 않고 `node_getter()`의 Node를 사용합니다.
Node name과 namespace를 각 Graph reader에 전달하고 반환된 관계 목록을
`build_node_item()`에 넣습니다. `publisher_count` 같은 값은 관계 목록의 개수이지
메시지 처리량이 아닙니다.

Graph reader에서 예외가 나면 빈 관계로 안전 처리합니다(`node/runtime.py`
L158-L215). 따라서 빈 배열 하나만으로 Node 장애를 확정할 수는 없습니다.

## 3. 사라진 Node의 stale 처리

```text
현재 Graph Node와 이전 cache 비교
  — node/runtime.py L130-L147

→ 이전에는 있었지만 현재 없는 Node 발견
  — NodeRuntime.update()

→ stale timeout 안이면 stale item 생성
  — node/discovery.py L58-L69
  — stale_node_item()

→ timeout이 지나면 목록에서 제거
  — node/runtime.py L138-L145
```

stale은 운영체제 process를 직접 검사해 죽음을 확정한 값이 아닙니다. ROS2 Graph에서
사라진 Node를 직전 cache와 비교해 잠시 보존한 상태입니다. 설정은
`backend/config/monitor.yaml` L55-L59이며 현재 5초입니다. 영구 이력 DB가 아니므로
시간이 지나면 사라집니다.

## 4. REST와 Frontend 관계 역매핑

```text
NodeRuntime.snapshot()
  — node/runtime.py L54-L67
→ RosMonitor.node_snapshot()
  — ros_monitor.py L113-L115
→ GET /ros/nodes
  — main.py L111-L121
→ Frontend polling
  — rosApi.js L51-L53, useNodeDashboard.js L8-L66
→ Nodes 화면
  — NodesPage.jsx L16-L163
→ Topic/Service/Action participant 역매핑
  — participants.js L1-L55, buildParticipantMaps()
```

Backend는 전체 Node 관계를 반환합니다. “주요 Node”는 Frontend 표시 정책으로
`nodeFilters.js`의 `isPrimaryNode()` L28-L36과 `isHiddenFromPrimary()` L38-L53이
결정합니다. Nodes와 Visualization이 같은 helper를 사용합니다.

Node stale Alert는 `node/alerts.py` L14-L41의 `build_node_alerts()`가 만들고
`RosMonitor.alerts()`에 병합됩니다.

## 5. 전체 흐름 한 문장

NodeRuntime이 Node별 통신 관계를 Graph에서 묶고 사라진 Node를 잠시 stale로 보존한
snapshot을 Nodes 화면과 participant map에 제공합니다.

## 초보자가 자주 틀리는 부분

- stale은 process 종료를 직접 확인한 값이 아닙니다.
- 관계 count는 Hz나 처리량이 아닙니다.
- 주요 Node 분류는 Backend 수집 정책이 아니라 Frontend 표시 정책입니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Node API는 이름뿐 아니라 Topic, Service, Action 관계를 제공합니다.
2. 사라진 Node는 timeout 동안 stale로 남았다가 제거됩니다.
3. Frontend는 Node 관계를 역매핑해 각 통신 상세의 실제 참여자를 표시합니다.
