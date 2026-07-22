# Visualization 데이터 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. 새 Backend API 없이 그래프를 만드는 방법

Visualization은 전용 Graph endpoint를 만들지 않는다. 기존 `/ros/nodes`, `/ros/topics`, `/ros/services`, `/ros/actions` 응답을 Frontend에서 합쳐 React Flow용 nodes/edges로 변환한다.

이 말은 Backend에 `/ros/graph` 같은 새 API를 만들지 않는다는 뜻이다. Graph 화면은 이미 존재하는 Monitoring REST 응답을 조합한다.

| 원본 데이터 | Backend endpoint | Router 위치 | 화면에서 쓰는 의미 |
|---|---|---|---|
| Node 관계 | `/ros/nodes` | `routers/monitoring.py` L73 | Node별 publisher/subscriber/service/action 관계의 기준 |
| Topic 상태 | `/ros/topics` | `routers/monitoring.py` L16 | Topic node와 상태 badge |
| Service 상태 | `/ros/services` | `routers/monitoring.py` L43 | Service node와 server/client 상태 |
| Action 상태 | `/ros/actions` | `routers/monitoring.py` L60 | Action node와 server/client/status |

## 2. 데이터 수집과 graph 변환 코드 추적

```text
VisualizationPage
→ useVisualizationGraph()
→ 네 REST API polling
→ participant map 생성
→ buildCommunicationGraph()
→ stable graph 적용
→ React Flow 렌더링
```

| 단계 | 코드 위치 |
|---|---|
| Visualization page | `frontend/src/pages/VisualizationPage.jsx` L11 |
| Node 선택 | `frontend/src/pages/VisualizationPage.jsx` L71 |
| graph hook | `frontend/src/hooks/useVisualizationGraph.js` L19 |
| participant 부착 | `frontend/src/hooks/useVisualizationGraph.js` L113 |
| graph node participant 계산 | `frontend/src/hooks/useVisualizationGraph.js` L215 |
| stable graph | `frontend/src/hooks/useVisualizationGraph.js` L238 |
| graph signature | `frontend/src/hooks/useVisualizationGraph.js` L253 |
| participant map | `frontend/src/utils/participants.js` L1 |
| graph 변환 진입 | `frontend/src/utils/graphTransform.js` L18 |
| node 중심 graph | `frontend/src/utils/graphTransform.js` L185 |
| 관계 표시 제한 | `frontend/src/utils/graphTransform.js` L356 |
| React Flow component | `frontend/src/components/visualization/CommunicationGraph.jsx` L19 |
| 상세 패널 | `frontend/src/components/visualization/VisualizationDetailPanel.jsx` L5 |

## 3. 표시 모드

- `nodes`: Graph 대신 선택 가능한 Node 카드 중심으로 표시.
- `connected`: 선택 Node와 직접 연결된 1-hop 관계 표시.
- `all`: filter를 적용한 전체 관계 표시.

“전체 Node” filter와 “전체 Graph” mode는 다르다. participant map은 Backend 응답을 바꾸지 않고 화면에서 entity별 publishers/servers/clients로 역매핑한다.

### Visualization을 라인으로 따라가기

```text
frontend/src/pages/VisualizationPage.jsx L11
→ useVisualizationGraph()
→ frontend/src/hooks/useVisualizationGraph.js L19 hook 시작
→ /ros/nodes, /ros/topics, /ros/services, /ros/actions polling
→ useVisualizationGraph.js L113 participant 부착
→ useVisualizationGraph.js L215 graph node participant 계산
→ frontend/src/utils/participants.js L1 participant map 생성
→ frontend/src/utils/graphTransform.js L18 buildCommunicationGraph()
→ graphTransform.js L185 node 중심 graph
→ graphTransform.js L356 관계 표시 제한
→ useVisualizationGraph.js L238 stable graph 적용
→ CommunicationGraph.jsx L19 React Flow 렌더링
```

React Flow에 넘기는 nodes/edges id는 polling마다 바뀌면 안 된다. 그래서 graph 변환은 kind/name 기반의 안정적인 id를 만들고, hook은 signature가 같으면 이전 객체를 재사용한다.

## 4. polling 때 그래프 안정화

- nodes/edges id는 kind/name 기반으로 안정적으로 만든다.
- graph signature가 같으면 이전 객체를 재사용한다.
- polling마다 React Flow를 remount하거나 자동 fitView를 반복하지 않는다.
- fitView는 최초 필요 시 또는 사용자 동작에 맞춰 제한적으로 실행한다.
- polling 응답마다 자동 `fitView`를 반복하면 사용자가 보고 있던 위치가 계속 튄다.
- Node 중심 화면은 복잡한 전체 Graph보다 먼저 이해하기 쉬운 진입점이다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Visualization 원본 데이터는 네 기존 REST API다.
2. participant map과 graphTransform이 화면용 nodes/edges를 만든다.
3. stable id와 signature 재사용으로 polling 중 화면 흔들림을 줄인다.
