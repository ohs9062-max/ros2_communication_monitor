# 기능별 코드 위치 빠른 색인

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 사용 방법

발표나 디버깅 중 “이 기능은 어디서 시작해 어디로 가는가”를 빠르게 찾는
색인이다. 세부 설명은 각 흐름 문서를 따른다.

## 2. Backend 시작과 공통 흐름

| 찾는 기능 | 시작 | 핵심 처리 | API/출력 |
|---|---|---|---|
| 서버 시작 | `main.py` L15-L31 | `ros_monitor.py` L59-L73 | FastAPI lifespan |
| 종료 정리 | `main.py` L21-L28 | `ros_monitor.py` L75-L93 | Node/cache 정리 |
| 주기 Graph 갱신 | `ros_monitor.py` L66-L70 | L304-L309 | Runtime cache |
| 통합 Alert | `ros_monitor.py` L156-L195 | 도메인 `alerts.py` | `main.py` L124-L127 |
| WebSocket | `main.py` L130-L147 | `ros_monitor.py` L117-L146 | `/ws/monitor` |

## 3. 도메인별 추적

| 기능 | Graph/입력 | Runtime/cache | REST |
|---|---|---|---|
| Topic 목록 | `topic/runtime.py` L101-L147 | L149-L158, L70-L80 | `main.py` L54-L66 |
| Topic latest | subscription callback L385-L401 | L160-L209 | `main.py` L69-L72 |
| Topic Hz | callback timestamp → `topic/hz.py` L14-L71 | `topic/runtime.py` L403-L440 | `main.py` L75-L78 |
| Service 목록 | `service/runtime.py` L86-L119 | L121-L127, L54-L79 | `main.py` L81-L95 |
| Service active check | `monitor.yaml` L36-L53 | `active_check_runtime.py` L60-L214 | Service snapshot에 병합 |
| Action 목록 | `action/runtime.py` L84-L125 | L127-L137, L70-L82 | `main.py` L98-L108 |
| Action status/feedback | `action/runtime.py` L325-L433 | `action/subscriptions.py` L122-L175 | Action runtime field |
| Action result | terminal goal L177-L186 | `result_runtime.py` L82-L223 | Action runtime field |
| Node 관계 | `node/runtime.py` L69-L128 | L130-L147, L54-L67 | `main.py` L111-L121 |

## 4. Frontend 시작과 화면

| 찾는 기능 | 시작/상태 | 화면 | 하위 component |
|---|---|---|---|
| 앱 시작 | `main.jsx` L1-L10, `App.jsx` L20-L33 | activePage L35-L69 | `AppShell` |
| URL/history | `useBrowserRoute.js` L3-L50 | `Sidebar.jsx` L14-L68 | pushState/popstate |
| Overview | App L35-L43 | `OverviewPage.jsx` L12-L173 | status/preview/chart |
| Topics | `useTopicDashboard.js` L17-L148 | `TopicsPage.jsx` L13-L181 | `TopicTable`, `TopicDetailPanel` |
| Services | `useServiceDashboard.js` L9-L76 | `ServicesPage.jsx` L73-L231 | `ServiceTable`, `ServiceDetailPanel` |
| Actions | `useActionDashboard.js` L9-L73 | `ActionsPage.jsx` L16-L174 | `ActionTable`, `ActionDetailPanel` |
| Nodes | `useNodeDashboard.js` L8-L66 | `NodesPage.jsx` L16-L163 | `NodeTable`, `NodeDetailPanel` |
| Visualization | `useVisualizationGraph.js` L19-L213 | `VisualizationPage.jsx` L11-L350 | React Flow/detail |
| Alerts | Topic dashboard alerts | `AlertsPage.jsx` L3-L60 | `AlertsList` |
| Settings | App L64-L69 | `PlaceholderPage.jsx` L1-L10 | 없음 |

## 5. 정책을 찾는 위치

| 정책 | 코드 위치 |
|---|---|
| Topic include/type/deep-monitor | `backend/.../topic/filters.py` L8-L65 |
| required stream/command Alert | `backend/.../topic/alerts.py` L24-L178 |
| Service category/hidden | `backend/.../service/filters.py` L16-L64 |
| Service allowlist | `backend/config/monitor.yaml` L36-L53 |
| Action observed-goal result | `backend/.../action/result_runtime.py` L102-L173 |
| Node stale timeout | `backend/config/monitor.yaml` L55-L59 |
| Frontend 주요 Node | `frontend/src/utils/nodeFilters.js` L1-L53 |
| Visualization hidden/active | `frontend/src/utils/graphTransform.js` L577-L655 |

## 6. 발표용 전체 다이어그램

```text
ROS2 Graph / messages
→ rclpy Node(/ros2_dashboard_topic_monitor)
→ RosMonitor coordinator
→ TopicRuntime / ServiceRuntime / ActionRuntime / NodeRuntime
→ thread-safe cache
→ FastAPI REST + lightweight WebSocket snapshot
→ React hooks
→ Page filter/selection
→ Table / Detail / React Flow
```

## 7. 관련 문서

- 환경: `01_environment_setup.md`
- Backend: `02_backend_flow.md`
- Topic~Node: `03_topic_flow.md`~`06_node_flow.md`
- Alert/WebSocket: `07_alert_flow.md`, `08_websocket_flow.md`
- Frontend/Visualization: `09_frontend_flow.md`, `10_visualization_flow.md`
