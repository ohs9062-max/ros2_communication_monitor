# Frontend 데이터 흐름

## 무엇을 하는가

Frontend는 Vite + React 기반 웹앱이다. ROS2에 직접 접근하지 않고 FastAPI의 REST와 WebSocket 결과를 화면 상태로 바꾼다.

```text
FastAPI
→ rosApi.js
→ polling/WebSocket hooks
→ 공통 filter와 status helper
→ page/component
```

## 화면별 데이터

| 화면 | 주요 데이터 |
|---|---|
| Overview | Topic/Service/Action/Node 집계와 최근 Alert |
| Topics | Topic 목록, 선택 Topic latest/Hz |
| Services | Service 목록과 Server/Client 관계 |
| Actions | Action 목록과 Goal 관찰 상태 |
| Nodes | Node 목록과 여섯 종류 통신 관계 |
| Visualization | 네 리소스 REST 응답을 조합한 graph |
| Alerts | active 목록과 resolved history |
| Interface Lab | registry, Apply, 실행 후보와 history |

`App.jsx`는 현재 page에 필요한 polling만 활성화한다. Nodes와 Visualization은 관계 판정에 여러 리소스 데이터가 필요하므로 Topic, Service, Action, Node를 함께 조회한다.

## 주요 항목 필터

`primaryFilters.js`가 Topic, Service, Action의 공통 판정을 제공하고 `nodeFilters.js`가 관계 타입으로 주요 Node를 판정한다.

- Topic: Backend `supported_type` 등 실제 감시 신호
- Service: Backend `allowlisted`
- Action: Backend `allowlisted`
- Node: 위 주요 통신의 타입과 Node 관계 타입 exact match

Overview, 각 목록, Visualization은 이 helper를 재사용한다. YAML 파일을 Frontend가 직접 읽지 않는다.

기존 기본 주요 항목을 위한 호환 규칙도 남아 있으므로 코드에 일부 기존 이름 기준이 존재한다. 다만 YAML 등록 custom Interface를 화면마다 새 이름으로 하드코딩하지 않고 Backend의 타입 판정 결과를 사용한다.

## 상태 표시

공통 status helper와 `StatusBadge`가 상태를 화면 색과 문구로 바꾼다.

- 현재 Graph에 있음: 정상, 사용 가능 또는 대기
- 이전 발견 후 없음: `disconnected`, 빨강
- 정보 부족: `unknown`, 중립이며 오류 집계 제외
- 해결 Alert: `resolved`, 초록

Graph만으로 종료 원인을 알 수 없기 때문에 “비정상 종료”라고 단정하지 않는다.

## Polling 안정성

공통 `usePolling`은 interval을 cleanup하고, 응답 state가 바뀔 때 interval 자체가 다시 만들어지지 않도록 안정적인 reset 기준을 사용한다.

Topic latest/Hz는 현재 선택 Topic에 대해서만 요청한다. 늦게 도착한 이전 요청이 새 선택 값을 덮지 않도록 응답의 Topic 이름과 현재 선택 이름을 비교한다. Action 내부 Topic과 관리용 내부 Topic은 기본 상세 선택과 Hz polling 후보에서 제외한다.

## Alert 표시

Overview의 최근 Alert는 접힌 상태에서 3개를 보여주고 펼치면 최대 10개를 보여준다.

Alerts 화면은 다음 두 탭으로 나뉜다.

- 현재 Alert: `resolved`가 아닌 active 장애
- 이전 Alert: Backend `history`의 해결 항목, 최대 50개

resolved는 초록 “해결됨”으로 보이지만 현재 warning/error 집계에는 포함되지 않는다.

## Interface Lab

Interface Lab은 Monitoring 화면과 달리 사용자 입력으로 실제 Publish, Receive, Call, Goal을 실행할 수 있다. Graph 후보 자동 입력은 사용자가 직접 입력한 Topic 이름을 polling 때 덮어쓰지 않도록 입력 출처를 구분한다.

세부 실행 흐름은 [12_interface_lab_flow.md](12_interface_lab_flow.md)에 있다.

## 담당 파일

- `frontend/src/api/rosApi.js`
- `frontend/src/hooks/usePolling.js`
- `frontend/src/hooks/useMonitorWebSocket.js`
- `frontend/src/utils/primaryFilters.js`
- `frontend/src/utils/nodeFilters.js`
- `frontend/src/utils/status.js`
- `frontend/src/pages/`

## 문제가 생기면

1. 같은 시각의 REST 응답과 화면 값을 비교
2. Backend 필드가 Frontend helper에서 다른 이름으로 읽히는지 확인
3. page 전환 뒤 불필요 polling이 남는지 확인
4. effect dependency에 매 render 새 배열·객체·함수가 들어가는지 확인
5. 동일 값을 반복 `setState`해 Maximum update depth가 생기는지 확인
