# Frontend 전체 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Frontend가 맡는 일

Frontend는 ROS2에 직접 접근하지 않습니다. FastAPI REST 응답을 일정 간격으로
가져와 React state에 보관하고, Page가 filter와 선택을 적용해 Table과 Detail을
그립니다. WebSocket은 연결 상태와 경량 요약만 보조합니다.

## 2. 앱 시작과 화면 선택

```text
browser가 main.jsx 실행
  — frontend/src/main.jsx L1-L10
  — React root에 App 렌더링

→ App가 route와 도메인 hook 생성
  — App.jsx L20-L26, App()
  — useBrowserRoute(), use*Dashboard(), useMonitorWebSocket()

→ activePage에 맞는 Page 선택
  — App.jsx L28-L70

→ AppShell이 Sidebar, Header, 본문 배치
  — AppShell.jsx L5-L33
```

`useBrowserRoute()`는 현재 URL에서 page를 정하고 `navigate()`를 반환합니다
(`useBrowserRoute.js` L18-L39). Sidebar의 일반 클릭은 `preventDefault()` 후
`pushState`로 이동하고, browser 뒤로/앞으로 가기는 `popstate` callback이 처리합니다
(`Sidebar.jsx` L14-L68, `useBrowserRoute.js` L18-L39). 별도
`react-router-dom`을 사용하지 않습니다.

## 3. REST polling과 React state

Frontend가 정해진 간격마다 API를 다시 호출하는 방식을 polling이라고 합니다.
공통 `usePolling()`은 fetch 함수, 간격, 초기값을 전달받아 최초 1회와 이후 반복
요청을 실행합니다.

```text
도메인 hook이 usePolling(fetcher, intervalMs) 호출
  — usePolling.js L3-L66
  — useTopicDashboard.js L17-L148 등

→ poll()이 API fetch 함수 호출
  — usePolling.js L36-L58
  — rosApi.js L22-L53

→ requestJson()이 FastAPI REST 응답 수신
  — rosApi.js L12-L20

→ data/error/lastUpdated/loading state 갱신
  — usePolling.js L38-L53

→ 도메인 hook이 배열, meta, 선택 item 조립
  — 각 use*Dashboard.js

→ App가 dashboard 값을 Page에 prop으로 전달
  — App.jsx L28-L63
```

`poll()`은 `async` 함수이므로 HTTP 응답을 기다리는 동안 화면 전체를 멈추지
않습니다. `setInterval`에 전달한 `poll`은 시간이 되었을 때 browser가 실행하는
callback입니다. component가 정리되면 interval도 해제합니다
(`usePolling.js` L60-L64).

도메인 간격은 Topic 목록 1초(`useTopicDashboard.js` L14-L17), Service/Action/Node
3초(각 hook L5-L9), Visualization 5초(`useVisualizationGraph.js` L17-L46)입니다.
이는 Backend Graph cache 갱신 주기가 아닙니다.

## 4. 목록 선택에서 Detail까지

Topic을 예로 들면 다음과 같습니다.

```text
App가 useTopicDashboard() 객체 사용
  — App.jsx L20-L26
  — useTopicDashboard.js L17-L148

→ TopicsPage가 목록 filter
  — TopicsPage.jsx L13-L181

→ TopicTable row의 onSelect 호출
  — TopicTable.jsx L38-L118

→ selectedTopicName state 변경
  — useTopicDashboard.js L18-L20, L132-L147
  — setSelectedTopicName

→ 선택 Topic의 latest/Hz polling 활성화
  — useTopicDashboard.js L33-L47
  — latestFetcher, hzFetcher, usePolling(enabled)

→ TopicDetailPanel에 topic/latest/hz 전달
  — TopicDetailPanel.jsx L6-L145
```

Service, Action, Node도 `useServiceDashboard` → `ServicesPage`,
`useActionDashboard` → `ActionsPage`, `useNodeDashboard` → `NodesPage`의 같은 구조를
사용합니다. 대부분의 hook은 Page 내부가 아니라 App에서 항상 생성되므로 다른
Page를 보는 동안에도 목록 polling이 유지됩니다.

## 5. 화면별 코드 위치

| 화면 | 상태와 API | Page |
|---|---|---|
| Overview | App의 도메인 hook 전체 | `OverviewPage.jsx` L12-L173 |
| Topics | `useTopicDashboard.js` L17-L148 | `TopicsPage.jsx` L13-L181 |
| Services | `useServiceDashboard.js` L9-L76 | `ServicesPage.jsx` L73-L231 |
| Actions | `useActionDashboard.js` L9-L73 | `ActionsPage.jsx` L16-L174 |
| Nodes | `useNodeDashboard.js` L8-L66 | `NodesPage.jsx` L16-L163 |
| Visualization | `useVisualizationGraph.js` L19-L213 | `VisualizationPage.jsx` L11-L350 |
| Alerts | Topic dashboard의 alerts | `AlertsPage.jsx` L3-L60 |

Node 응답의 관계를 Topic/Service/Action 중심으로 뒤집는 participant map은
`participants.js` L1-L55의 `buildParticipantMaps()`가 만듭니다. Backend 응답 key를
바꾸지 않고 Frontend에서 가공합니다.

## 6. 전체 흐름 한 문장

App에서 만든 도메인 hook이 REST를 polling해 state를 보관하고 Page가 filter와 선택을
적용한 뒤 Table과 Detail component에 전달합니다.

## 초보자가 자주 틀리는 부분

- Table component가 API나 ROS2를 직접 호출하지 않습니다.
- Page를 바꾸어도 App에 생성된 polling은 대부분 계속됩니다.
- WebSocket snapshot이 REST table state를 덮어쓰지 않습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. `rosApi.js`가 HTTP 요청, `usePolling`과 도메인 hook이 state를 담당합니다.
2. Page는 filter와 선택, component는 표와 상세 표시를 담당합니다.
3. Frontend polling, Backend polling, WebSocket 주기는 서로 독립입니다.
