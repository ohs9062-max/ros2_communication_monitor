# Visualization 데이터 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

네 REST 목록 수집, participant map, Node 카드 filter, 1-hop/full graph 변환,
React Flow 안정화, 선택 detail 흐름을 설명한다.

Visualization은 새 backend Graph API 없이 기존 네 API를 조합한다.

## 2. 전체 흐름

```text
/ros/nodes + /ros/topics + /ros/services + /ros/actions
→ useVisualizationGraph
→ participant map + filters
→ buildCommunicationGraph
→ stable nodes/edges
→ CommunicationGraph(React Flow)
→ VisualizationDetailPanel
```

## 3. 데이터 수집과 Node 선택 카드

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | 네 API를 5초 polling | `frontend/src/hooks/useVisualizationGraph.js` | L17-L46 | `useVisualizationGraph` |
| 2 | API wrapper에서 배열 추출 | 같은 파일 | L48-L63 | memo 네 개 |
| 3 | Node 관계 participant map | 같은 파일 | L64-L67 | `buildParticipantMaps` 호출 |
| 4 | graph filter object 구성 | 같은 파일 | L68-L89 | `filters` memo |
| 5 | graphTransform 호출 | 같은 파일 | L90-L101 | `buildCommunicationGraph` |
| 6 | 주요/실행/전체 Node 카드 filter | 같은 파일 | L130-L162 | `selectableNodes` memo |
| 7 | 검색은 filter 결과 안에서 적용 | 같은 파일 | L131-L153 | `selectableNodes` memo |
| 8 | Node 선택 후 connected mode | `frontend/src/pages/VisualizationPage.jsx` | L71-L76 | `selectNode` |

주요 Node는 `nodeFilters.js` L28-L53의 `isPrimaryNode`, 실행 Node는
`status === 'active'`이면서 daemon이 아닌 Node, 전체 Node는 숨김 포함 여부에
따라 `isHiddenGraphNode`를 적용한다.

## 4. participant map

`participants.js` L1-L55는 Node item의 관계를 역매핑한다.

| Node 관계 | 역매핑 결과 |
|---|---|
| `topic_publishers` / `topic_subscribers` | Topic별 publishers/subscribers |
| `service_servers` / `service_clients` | Service별 servers/clients |
| `action_servers` / `action_clients` | Action별 servers/clients |

선택 graph node에 participants를 붙이는 코드는
`useVisualizationGraph.js` L102-L116과 L215-L235다.

## 5. graphTransform과 view mode

| 기능 | 파일 | 라인 | 함수 |
|---|---|---|---|
| 진입점과 mode 분기 | `frontend/src/utils/graphTransform.js` | L18-L33 | `buildCommunicationGraph` |
| Full Graph node/edge 조립 | 같은 파일 | L35-L175 | `buildCommunicationGraph` |
| 선택 Node 1-hop 조립 | 같은 파일 | L185-L354 | `buildNodeGraph` |
| 관계 제한 적용 | 같은 파일 | L356-L376 | `addLimitedNodeEdge` |
| stable edge/id 생성 | 같은 파일 | L395-L450 | `addEntityEdge`, `ensureGraphNode` |
| 검색 적용 | 같은 파일 | L548-L575 | `applySearch`, `nodeMatches` |
| active/hidden 판단 | 같은 파일 | L577-L655 | `shouldShowNode`, `shouldShowEntity` 외 |
| layout | 같은 파일 | L463-L541 | `layoutNodes`, `layoutNodeView` 외 |

- `viewMode='nodes'`: Graph 대신 Node 선택 카드 목록을 표시한다.
- `viewMode='connected'`: 선택 Node와 직접 연결된 1-hop 관계를 그린다.
- `viewMode='all'`: 전체 관계 Graph를 그리며 복잡성 안내를 표시한다.

## 6. React Flow 렌더링 안정성

| 기능 | 파일 | 라인 | 함수 |
|---|---|---|---|
| graph signature로 동일 객체 재사용 | `frontend/src/hooks/useVisualizationGraph.js` | L238-L275 | `useStableGraph`, `graphSignature` |
| 선택 상태만 node에 병합 | `frontend/src/components/visualization/CommunicationGraph.jsx` | L15-L31 | `CommunicationGraph` |
| fit handler 전달 | 같은 파일 | L33-L35 | effect |
| 최초 한 번만 자동 fit | 같은 파일 | L37-L46 | effect |
| ReactFlow/Minimap/Controls | 같은 파일 | L48-L66 | `CommunicationGraph` |

polling마다 key를 바꾸거나 매번 자동 fit하지 않는다. Node/edge id는
`graphTransform.js` L395-L450, L676-L678의 안정적인 kind/name 기반 값이다.

## 7. Page와 detail 연결

- mode/toolbar/summary: `VisualizationPage.jsx` L48-L252
- Node 카드: L254-L304
- Graph canvas: L306-L339
- 오른쪽 detail: L342-L347
- detail component와 보조 renderer: `VisualizationDetailPanel.jsx` L5-L313
- graph node UI: `GraphNodeCard.jsx` L11-L29

선택한 id가 filter 변경으로 사라지면 hook의
`selectedGraphNodeMissing`(`useVisualizationGraph.js` L191-L194)이 true가 되고,
detail panel에 missing id를 전달한다.

## 8. 발표 때 설명할 문장

“처음에는 주요 Node만 선택 카드로 보여주고, 선택하면 직접 연결된 1-hop 관계를
그립니다. 전체 Graph는 구조 확인용 고급 보기로 분리했습니다.”

## 9. 헷갈리기 쉬운 부분

- 상단 “실행 노드”는 현재 active Node 카드 filter다.
- “전체 Node”와 “전체 Graph”는 서로 다른 기능이다.
- 숨김 포함은 전체 Node/Graph에서 내부 daemon 포함 여부에 영향을 준다.
- participant map은 backend 응답을 변경하지 않고 frontend에서 역매핑한다.

## 10. 관련 파일 빠른 참조

`useVisualizationGraph.js`, `VisualizationPage.jsx`, `graphTransform.js`,
`participants.js`, `nodeFilters.js`, `CommunicationGraph.jsx`,
`GraphNodeCard.jsx`, `VisualizationDetailPanel.jsx`
