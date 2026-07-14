# 기능별 코드 위치 빠른 색인

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. 이 색인을 사용하는 방법

기능을 추적할 때는 “누가 시작하는가 → 어떤 함수가 처리하는가 → 어느 cache에
저장하는가 → 어떤 API와 화면이 읽는가” 순서로 봅니다. 함수가 정의된 위치와 그
함수를 호출하는 위치는 다를 수 있습니다.

```text
시작 함수와 호출 위치 확인
  — main.py, ros_monitor.py 또는 각 Page/hook의 표기 라인
→ Runtime update 또는 callback 확인
  — 각 도메인 runtime.py의 update()/callback()
→ cache 저장 위치 확인
  — 각 runtime.py의 Lock 보호 구간
→ snapshot과 FastAPI endpoint 확인
  — ros_monitor.py L95-L195, main.py L54-L147
→ Frontend API, hook, Page, component 확인
  — rosApi.js L12-L53, App.jsx L20-L70
```

## 2. Backend 시작과 공통 흐름

| 기능 | 시작·호출 | 핵심 처리 | 출력 |
|---|---|---|---|
| 서버 시작 | `main.py` L15-L31 | `ros_monitor.py` L59-L73 | Runtime 시작 |
| 서버 종료 | `main.py` L25-L28 | `ros_monitor.py` L75-L93 | Node/cache 정리 |
| Graph 반복 갱신 | `ros_monitor.py` L66-L70 | L304-L309 | 네 Runtime cache |
| 통합 Alert | `ros_monitor.py` L156-L195 | 도메인 `alerts.py` | `main.py` L124-L127 |
| WebSocket | `main.py` L130-L147 | `ros_monitor.py` L117-L146 | `/ws/monitor` |

```text
FastAPI lifespan이 RosMonitor.start() 호출
  — main.py L21-L31
→ timer와 spin thread 시작
  — ros_monitor.py L59-L73, L292-L302
→ _update_graph()가 Runtime.update() 호출
  — ros_monitor.py L304-L309
→ REST/WebSocket이 snapshot 읽기
  — main.py L54-L147, ros_monitor.py L95-L146
```

## 3. Topic 추적

```text
Graph와 목록 cache
  — topic/runtime.py L101-L158, TopicRuntime.update()
→ 메시지 callback
  — topic/runtime.py L296-L401
→ latest와 Hz
  — topic/runtime.py L160-L246, L403-L440
→ REST
  — main.py L54-L78
→ Frontend
  — rosApi.js L26-L36, useTopicDashboard.js L17-L148
```

정책 위치는 include/type/deep monitoring `topic/filters.py` L8-L65, required
stream Alert `topic/alerts.py` L83-L178입니다.

## 4. Service 추적

```text
Service Graph와 public item
  — service/runtime.py L86-L127
→ allowlist active check
  — service/runtime.py L129-L134
  — active_check_runtime.py L60-L214
→ 다음 update에서 결과 병합
  — service/runtime.py L94-L119
→ REST와 Frontend
  — main.py L81-L95
  — rosApi.js L42-L45, useServiceDashboard.js L9-L76
```

category/hidden 정책은 `service/filters.py` L30-L64, allowlist 설정은
`backend/config/monitor.yaml` L36-L53입니다.

## 5. Action 추적

```text
Action Graph와 count
  — action/runtime.py L84-L137, L159-L256
→ status/feedback subscription과 callback
  — action/runtime.py L258-L433
→ observed terminal Goal result
  — action/subscriptions.py L177-L217
  — action/result_runtime.py L82-L223
→ REST와 Frontend
  — main.py L98-L108
  — rosApi.js L47-L49, useActionDashboard.js L9-L73
```

Result 정책은 `ActionResultRuntime.support()`
`action/result_runtime.py` L69-L80과 요청 함수 L102-L173에서 확인합니다.

## 6. Node와 Alert 추적

```text
Node별 Graph 관계와 stale cache
  — node/runtime.py L69-L147
→ Node snapshot과 REST
  — node/runtime.py L54-L67
  — main.py L111-L121
→ Frontend와 participant map
  — useNodeDashboard.js L8-L66
  — participants.js L1-L55
```

Alert 통합은 `RosMonitor.alerts()` `ros_monitor.py` L156-L195에서 시작하고 Topic
`topic/alerts.py` L37-L278, Service `service/alerts.py` L37-L88, Action
`action/alerts.py` L18-L84, Node `node/alerts.py` L14-L41 순서로 합칩니다.

## 7. Frontend 공통 추적

| 기능 | 상태·호출 | 화면 |
|---|---|---|
| 앱과 route | `App.jsx` L20-L70, `useBrowserRoute.js` L18-L50 | `AppShell` |
| 공통 polling | `usePolling.js` L3-L66, `rosApi.js` L12-L53 | 각 Page |
| Topics | `useTopicDashboard.js` L17-L148 | `TopicsPage.jsx` L13-L181 |
| Services | `useServiceDashboard.js` L9-L76 | `ServicesPage.jsx` L73-L231 |
| Actions | `useActionDashboard.js` L9-L73 | `ActionsPage.jsx` L16-L174 |
| Nodes | `useNodeDashboard.js` L8-L66 | `NodesPage.jsx` L16-L163 |
| Visualization | `useVisualizationGraph.js` L19-L275 | `VisualizationPage.jsx` L11-L350 |

```text
rosApi fetch 함수
  — rosApi.js L22-L53
→ usePolling과 도메인 hook
  — usePolling.js L3-L66, 각 use*Dashboard.js
→ App가 Page에 dashboard prop 전달
  — App.jsx L28-L63
→ Page filter와 선택
  — TopicsPage.jsx L13-L181 등 각 Page
→ Table / Detail / React Flow
  — frontend/src/components/, CommunicationGraph.jsx L15-L66
```

각 단계의 실제 설명과 라인은 `09_frontend_flow.md`와
`10_visualization_flow.md`에서 확인합니다.

## 8. 전체 흐름 한 문장

ROS2 입력은 Runtime update와 callback을 통해 cache가 되고 FastAPI snapshot을 거쳐
Frontend hook, Page, Table·Detail·React Flow로 전달됩니다.

## 초보자가 자주 틀리는 부분

- 함수 정의 위치와 호출 위치를 같은 것으로 보지 않습니다.
- callback 등록 시점과 실제 실행 시점은 다릅니다.
- 정적 line trace만으로 실제 장비의 Graph 내용이나 응답 성공을 보장할 수 없습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Backend는 `main.py → RosMonitor → Runtime → cache/snapshot` 순서로 추적합니다.
2. Frontend는 `rosApi → hook → Page → component` 순서로 추적합니다.
3. update 경로와 snapshot 읽기 경로를 분리하면 흐름이 명확해집니다.
