# Frontend 전체 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

React 시작, URL/history routing, 공통 layout, REST polling, 화면별 hook,
table 선택과 detail panel 렌더링 흐름을 설명한다.

`App`이 도메인 hook을 한 번 생성해 page에 전달하고, 각 page가 filter/선택을
적용해 table과 detail component를 조립한다.

## 2. 앱 시작과 routing

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | React root에 App 렌더링 | `frontend/src/main.jsx` | L1-L10 | module entry |
| 2 | route와 도메인 hook 생성 | `frontend/src/App.jsx` | L20-L26 | `App` |
| 3 | activePage에 따라 page 렌더링 | 같은 파일 | L28-L70 | `App` |
| 4 | URL↔page map | `frontend/src/hooks/useBrowserRoute.js` | L3-L16 | `PAGE_PATHS`, `PATH_PAGES` |
| 5 | 뒤로/앞으로 popstate 처리 | 같은 파일 | L18-L30 | `useBrowserRoute` |
| 6 | pushState 내부 이동 | 같은 파일 | L32-L39 | `navigate` |
| 7 | 실제 href와 click 이동 | `frontend/src/layout/Sidebar.jsx` | L14-L68 | `Sidebar` |

이 프로젝트는 `react-router-dom`이 아니라 자체 `useBrowserRoute`를 사용한다.
URL route와 browser history는 유지되지만 route matching 범위는 위 map에 한정된다.

## 3. 공통 데이터 흐름

| 단계 | 파일 | 라인 | 함수 |
|---|---|---|---|
| API base와 fetch wrapper | `frontend/src/api/rosApi.js` | L1-L20 | `API_BASE_URL`, `requestJson` |
| endpoint별 fetch 함수 | 같은 파일 | L22-L53 | `fetchHealth` 외 |
| 초기 fetch/interval/manual refresh | `frontend/src/hooks/usePolling.js` | L3-L66 | `usePolling` |
| layout/sidebar/header 조립 | `frontend/src/layout/AppShell.jsx` | L5-L33 | `AppShell` |
| backend/WS 상태 표시 | `frontend/src/layout/Header.jsx` | L3-L55 | `Header` |

REST polling이 목록과 상세의 데이터 원본이고 WebSocket은 App L26에서 별도로
연결해 Header와 Visualization에 전달한다.

## 4. 화면별 코드 위치

| 화면 | hook/API | page | table/detail 또는 출력 |
|---|---|---|---|
| Overview | 도메인 hook 전체 | `OverviewPage.jsx` L12-L173 | status/preview/chart |
| Topics | `useTopicDashboard.js` L17-L148 | `TopicsPage.jsx` L13-L181 | table L38-L118, detail L6-L145 |
| Services | `useServiceDashboard.js` L9-L76 | `ServicesPage.jsx` L73-L231 | table L35-L105, detail L5-L116 |
| Actions | `useActionDashboard.js` L9-L73; actions/alerts/nodes | `ActionsPage.jsx` L16-L174 | `ActionTable.jsx` L38-L116, `ActionDetailPanel.jsx` L5-L195 |
| Nodes | `useNodeDashboard.js` L8-L66; nodes/alerts | `NodesPage.jsx` L16-L163 | `NodeTable.jsx` L41-L108, `NodeDetailPanel.jsx` L5-L121 |
| Visualization | `useVisualizationGraph.js` L19-L213; 네 목록 API | `VisualizationPage.jsx` L11-L350 | `CommunicationGraph`, `VisualizationDetailPanel` |
| Alerts | Topic dashboard의 alerts + 도메인 선택 setter | `AlertsPage.jsx` L3-L60 | `AlertsList.jsx` L1-L65 |
| Settings | 별도 hook/API 없음 | `App.jsx` L64-L69 | `PlaceholderPage.jsx` L1-L10 |

## 5. 선택 row에서 detail까지

도메인 hook은 `selected*Name` state와 API 목록에서 찾은 `selected*` item을
반환한다. page는 filter 결과에 선택 item이 남아 있는지 확인하고 table의
`onSelect`와 detail component에 전달한다.

예를 들어 Topic은 다음 순서다.

```text
App.useTopicDashboard
→ TopicsPage filteredTopics
→ TopicTable onSelect
→ setSelectedTopicName
→ hook이 latest/Hz polling 활성화
→ TopicDetailPanel
```

participant 목록은 `participants.js` L1-L55에서 `/ros/nodes`의 관계를
Topic/Service/Action 중심으로 역매핑한다.

## 6. 발표 때 설명할 문장

“페이지는 표시와 filter를 담당하고, API polling과 선택 state는 도메인 hook,
공통 fetch는 rosApi, 표와 상세 UI는 component로 분리했습니다.”

## 7. 헷갈리기 쉬운 부분

- hook은 page 내부가 아니라 대부분 `App`에서 항상 생성되므로 다른 page에서도
  polling이 유지된다.
- Settings는 현재 실제 설정 편집 화면이 아니라 placeholder다.
- Sidebar는 `<a>`를 쓰지만 일반 클릭은 preventDefault 후 pushState로 처리한다.
- WebSocket snapshot이 REST table state를 직접 갱신하지 않는다.

## 8. 관련 파일 빠른 참조

`main.jsx`, `App.jsx`, `useBrowserRoute.js`, `AppShell.jsx`, `Sidebar.jsx`,
`Header.jsx`, `api/rosApi.js`, `hooks/usePolling.js`, `pages/`, `components/`
