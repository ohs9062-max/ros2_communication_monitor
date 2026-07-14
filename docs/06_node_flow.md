# Node 모니터링 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

Node 발견, Node별 Topic/Service/Action 관계, count, stale 보존,
REST 응답과 Frontend 주요 Node filter를 설명한다.

`NodeRuntime`은 ROS2 Graph의 Node별 관계를 public item으로 조립하고,
사라진 Node를 설정 시간 동안 `stale`로 보존한다.

## 2. 전체 흐름

```text
get_node_names_and_namespaces
→ Node별 pub/sub/service/action Graph 조회
→ build_node_item에서 관계/count/status 조립
→ 사라진 cache를 stale로 잠시 보존
→ /ros/nodes
→ Frontend 주요/전체/실행/종료/숨김 filter
```

## 3. 단계별 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | Node names/namespaces 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/runtime.py` | L69-L87 | `NodeRuntime.update` |
| 2 | Topic publisher/subscriber 관계 | 같은 파일 | L89-L103 | `NodeRuntime.update` |
| 3 | Service server/client 관계 | 같은 파일 | L104-L115 | `NodeRuntime.update` |
| 4 | Action server/client 관계 | 같은 파일 | L116-L125 | `NodeRuntime.update` |
| 5 | public item/count 조립 | `backend/.../node/discovery.py` | L14-L55 | `build_node_item` |
| 6 | 사라진 Node stale 보존/제거 | `backend/.../node/runtime.py` | L130-L147 | `NodeRuntime.update` |
| 7 | stale item 생성 | `backend/.../node/discovery.py` | L58-L69 | `stale_node_item` |
| 8 | 목록 정렬과 meta snapshot | `backend/.../node/runtime.py` | L54-L67 | `NodeRuntime.snapshot` |
| 9 | meta의 관계 count 합계 | `backend/.../node/models.py` | L55-L86 | `node_meta` |
| 10 | stale Alert 생성 | `backend/.../node/alerts.py` | L14-L41 | `build_node_alerts` |

Graph reader 예외는 `_graph_by_node`(`node/runtime.py` L158-L174)에서 빈 목록으로,
Action Graph 예외는 L177-L215에서 빈 목록으로 안전 처리한다.

## 4. stale 의미

현재 Graph에서 사라졌더라도 cache의 `last_seen_at` 이후
`nodes.stale_timeout_sec` 이내면 stale item으로 남긴다. 현재 설정은
`backend/config/monitor.yaml` L55-L59의 5초다. 시간이 지나면 cache에서
제거되므로 stale은 영구 이력이 아니다.

## 5. Frontend 주요 Node filter

| 기능 | 파일 | 라인 | 함수 |
|---|---|---|---|
| 내부 daemon 판정 | `frontend/src/utils/nodeFilters.js` | L22-L26 | `isInternalNode` |
| 주요 Node whitelist/stale 판정 | 같은 파일 | L28-L36 | `isPrimaryNode` |
| Nav2 내부/launch/listener 등 제외 | 같은 파일 | L38-L53 | `isHiddenFromPrimary` |
| Nodes 화면 filter 적용 | `frontend/src/pages/NodesPage.jsx` | L16-L104 | `NodesPage` |
| Visualization 카드 재사용 | `frontend/src/hooks/useVisualizationGraph.js` | L130-L162 | `selectableNodes` memo |

주요 Node는 whitelist 또는 stale Node이며, daemon, lifecycle manager,
transform listener, launch node, costmap 내부 Node 등은 먼저 제외된다.
이 helper를 Nodes와 Visualization이 공유한다.

## 6. REST와 화면 연결

- REST: `main.py` L111-L121 `get_ros_nodes`
- coordinator: `ros_monitor.py` L113-L115 `node_snapshot`
- API 호출: `rosApi.js` L51-L53
- polling/선택 state: `useNodeDashboard.js` L8-L66
- page/table/detail: `NodesPage.jsx` L16-L163,
  `NodeTable.jsx` L41-L108, `NodeDetailPanel.jsx` L5-L121
- participant 역매핑: `participants.js` L1-L55 `buildParticipantMaps`

## 7. 발표 때 설명할 문장

“Node API는 단순 이름 목록이 아니라 각 Node가 발행·구독하거나 제공·요청하는
Topic, Service, Action 관계까지 Node 기준으로 묶어 제공합니다.”

## 8. 헷갈리기 쉬운 부분

- `stale`은 process 생존을 직접 검사한 값이 아니라 Graph에서 사라진 흔적이다.
- `publisher_count` 등은 관계 목록 길이이며 메시지 처리량이 아니다.
- backend는 전체 관계를 제공하고 “주요 Node”는 frontend 표시 정책이다.
- `/ros2_dashboard_topic_monitor`는 dashboard 자체 Node여서 주요 목록에서 숨긴다.

## 9. 관련 파일 빠른 참조

`node/runtime.py`, `node/discovery.py`, `node/models.py`, `node/filters.py`,
`node/alerts.py`, `frontend/src/utils/nodeFilters.js`,
`frontend/src/pages/NodesPage.jsx`
