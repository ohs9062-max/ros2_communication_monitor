# Visualization 데이터 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. 새 Backend API 없이 그래프를 만드는 방법

Visualization은 전용 Graph endpoint를 만들지 않습니다. 기존 Node, Topic, Service,
Action REST 응답을 Frontend에서 합쳐 React Flow가 사용할 nodes와 edges로 바꿉니다.
처음에는 Node 선택 카드를 보여주고, Node를 고르면 직접 연결된 1-hop 관계만
그립니다. 전체 Graph는 별도 고급 보기입니다.

## 2. 네 API 수집과 graph 변환

```text
VisualizationPage가 useVisualizationGraph() 호출
  — VisualizationPage.jsx L11-L14
  — useVisualizationGraph.js L19-L213

→ 네 REST API를 5초 polling
  — useVisualizationGraph.js L31-L46
  — fetchNodes/Topics/Services/Actions()

→ 응답에서 네 배열 추출
  — useVisualizationGraph.js L48-L63

→ Node 관계를 participant map으로 역매핑
  — useVisualizationGraph.js L64-L67
  — participants.js L1-L55, buildParticipantMaps()

→ filter와 네 배열을 graph 변환 함수에 전달
  — useVisualizationGraph.js L68-L100
  — graphTransform.js L18-L33, buildCommunicationGraph()

→ 안정화한 nodes/edges를 Page에 반환
  — useVisualizationGraph.js L101-L116, L171-L213

→ React Flow와 상세 패널 렌더링
  — VisualizationPage.jsx L306-L347
  — CommunicationGraph.jsx L15-L66
  — VisualizationDetailPanel.jsx L5-L313
```

`useVisualizationGraph()`은 filter와 선택 state를 가지고 네 API 결과를
`buildCommunicationGraph()`에 전달합니다. 변환 결과는 Backend cache가 아니라
Frontend 메모리에 있는 표시용 graph입니다.

## 3. Node 중심, 연결 중심, 전체 중심

- `viewMode='nodes'`: Graph 대신 선택 가능한 Node 카드 표시
- `viewMode='connected'`: 선택 Node와 직접 연결된 1-hop 관계 표시
- `viewMode='all'`: filter를 적용한 전체 관계 표시

```text
Node 카드 filter와 정렬
  — useVisualizationGraph.js L130-L162
  — nodeFilters.js L22-L53

→ 사용자가 Node 선택
  — VisualizationPage.jsx L71-L76, selectNode()

→ connected mode에서 buildNodeGraph() 실행
  — graphTransform.js L185-L354

→ 관계별 표시 수 제한
  — graphTransform.js L356-L376, addLimitedNodeEdge()
```

“전체 Node” filter와 “전체 Graph” view mode는 다른 기능입니다. participant map은
Node item의 `topic_publishers` 같은 관계를 entity별 publishers/servers/clients로
뒤집을 뿐 Backend 응답을 변경하지 않습니다.

## 4. polling 때 그래프가 흔들리지 않게 하는 방법

REST polling마다 React Flow 객체를 무조건 새로 사용하면 위치와 확대 상태가
불필요하게 바뀔 수 있습니다. 그래서 kind와 name으로 안정적인 id를 만들고 graph
내용이 같으면 이전 객체를 재사용합니다.

```text
kind/name 기반 node와 edge id 생성
  — graphTransform.js L395-L450, L676-L678

→ nodes/edges 내용으로 signature 생성
  — useVisualizationGraph.js L238-L275
  — useStableGraph(), graphSignature()

→ signature가 같으면 이전 graph 객체 재사용
  — useVisualizationGraph.js L238-L250

→ 선택 상태만 node에 병합
  — CommunicationGraph.jsx L15-L31

→ 최초 필요 시 한 번만 자동 fit
  — CommunicationGraph.jsx L33-L46
```

`useMemo`는 입력이 바뀌지 않으면 계산 결과를 재사용하고 `useStableGraph`는 graph
signature가 같을 때 이전 객체를 돌려줍니다. polling마다 key를 바꾸거나 자동
fitView를 반복하지 않습니다.

## 5. 선택 상세 정보

선택한 graph node에는 `participantsForGraphNode()`이 participant 정보를 붙입니다
(`useVisualizationGraph.js` L102-L116, L215-L235). 선택 id가 filter 변경으로
사라지면 `selectedGraphNodeMissing`을 만들어 상세 패널에 전달합니다
(`useVisualizationGraph.js` L191-L194).

## 6. 전체 흐름 한 문장

Frontend가 네 REST snapshot과 Node 관계를 합쳐 안정적인 id의 1-hop 또는 전체
graph를 만들고 React Flow와 상세 패널에 전달합니다.

## 초보자가 자주 틀리는 부분

- Visualization은 ROS2 CLI나 새 Backend endpoint를 사용하지 않습니다.
- connected mode는 재귀 전체 탐색이 아니라 직접 1-hop 관계입니다.
- 5초 polling마다 자동 fit하거나 React Flow를 다시 시작하지 않습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. 네 기존 REST API가 Visualization의 원본 데이터입니다.
2. participant map과 graphTransform이 관계를 화면용 nodes/edges로 바꿉니다.
3. stable id, signature 재사용, 제한된 fitView가 화면을 안정화합니다.
