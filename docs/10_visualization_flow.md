# Visualization 흐름

## 무엇을 하는가

Visualization은 Backend가 제공한 Topic, Service, Action, Node 관계를 하나의 그래프로 보여준다. React Flow는 완성된 `nodes`와 `edges`를 그리는 라이브러리이며 ROS2 관계를 스스로 분석하지 않는다.

## 데이터 흐름

```text
/ros/topics
/ros/services
/ros/actions
/ros/nodes
→ useVisualizationGraph
→ primary filter와 participant map
→ graphTransform
→ React Flow nodes / edges
→ 화면 렌더링
```

네 REST 응답의 갱신 시점이 잠깐 다를 수 있으므로 hook은 이전의 안정적인 graph를 보조적으로 유지해 한 번의 polling 차이로 화면이 과도하게 깜빡이지 않게 한다.

## 그래프에 포함되는 기준

주요 항목 모드는 목록 화면과 같은 정책을 사용한다.

- 등록 msg 타입과 exact match한 주요 Topic
- 등록 srv 타입과 exact match한 주요 Service
- 등록 action 타입과 exact match한 주요 Action
- 위 통신에 실제 참여하는 주요 Node
- 기존 기본 주요 항목

dashboard monitor 내부 Node와 관계없는 숨김·내부 항목은 기본 그래프에서 제외한다.

## 관계선 생성

Node의 publisher/subscriber, service server/client, action server/client 배열을 기준으로 edge를 만든다.

예:

```text
Node → Topic      Publisher
Topic → Node      Subscriber
Node ↔ Service    Server / Client
Node ↔ Action     Server / Client
```

타입 정보가 제공되는 관계는 전체 `full_type`이 같은지 확인한다. 등록 타입 이름만 보고 관계선을 만들지 않는다.

## 1-hop과 전체 Graph

- 전체 Graph: 현재 필터에 포함된 모든 리소스와 관계
- 1-hop: 선택한 항목과 직접 연결된 이웃까지만 표시

1-hop은 이미 조립된 graph에서 선택 항목과 연결된 edge를 필터링하는 화면 기능이다. Backend Graph 조회 방식을 바꾸지 않는다.

## 상태 표현

Node와 리소스의 상태는 REST 응답을 그대로 사용한다.

- `disconnected`: 빨간 종료 감지
- `unknown`: 중립, 오류 집계 제외
- active/waiting: 정상 또는 대기 색상

Frontend가 등록 여부만 보고 임의로 정상이나 disconnected를 만들지 않는다.

## 담당 파일

- `frontend/src/hooks/useVisualizationGraph.js`: 네 API 조회와 graph 상태
- `frontend/src/utils/graphTransform.js`: nodes/edges 변환
- `frontend/src/utils/primaryFilters.js`: 주요 리소스
- `frontend/src/utils/nodeFilters.js`: 주요 Node
- `frontend/src/pages/VisualizationPage.jsx`: React Flow 렌더링과 조작

## 문제가 생기면

1. 네 `/ros/*` 응답에 동일 리소스 이름과 타입이 있는지 확인
2. Node 관계 배열에 해당 endpoint가 있는지 확인
3. 주요 항목 helper 결과와 목록 화면 결과 비교
4. `graphTransform` 출력의 node id와 edge source/target 확인
5. React Flow 문제가 아니라 입력 `nodes`/`edges` 생성 문제인지 먼저 구분
