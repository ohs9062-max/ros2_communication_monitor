# Frontend 전체 흐름

Frontend는 React를 사용하여 백엔드에서 받은 ROS2 데이터를 시각화하는 웹 앱입니다.

## 주요 구조
- `App.jsx`: 앱의 최상위 컴포넌트, 전체 레이아웃을 정의합니다.
- `layout/`: `AppShell`, `Header`, `Sidebar`를 통해 공통 화면 틀을 만듭니다.
- `pages/`: 화면별(TopicsPage, NodesPage 등) 컴포넌트입니다.
- `hooks/`: 백엔드와 통신하는 로직(`useTopicDashboard.js` 등)을 담당합니다.
- `api/rosApi.js`: 백엔드 API를 호출하는 함수 모음입니다.
- `components/`: 데이터를 보여주는 `Table`, `DetailPanel`, `SummaryCard` 등입니다.

## 데이터 로딩 방식 (REST + WebSocket)
1. **페이지 진입**: `pages/`에서 해당 `hooks/`를 사용합니다.
2. **초기 데이터**: `hooks/` 내부에서 `usePolling.js` 또는 직접 fetch를 통해 REST API로 상세 데이터를 가져옵니다.
3. **실시간 업데이트**: `useMonitorWebSocket.js`를 사용하여 WebSocket으로 주기적으로 전체 상태 스냅샷을 받아 화면을 최신 상태로 유지합니다.

## 컴포넌트 동작 흐름
1. **페이지 진입**: `pages/TopicsPage.jsx` 로딩
2. **데이터 호출**: `useTopicDashboard.js` 안에서 `rosApi.js` 호출
3. **상태 저장**: hook 내부 상태(`useState`)에 데이터 저장
4. **렌더링**: 데이터를 `TopicTable.jsx`로 전달하여 화면 표시
5. **상세보기**: 테이블의 행(row) 선택 → 선택된 데이터를 `TopicDetailPanel.jsx`에 전달하여 상세 정보 표시

---

### 내가 반드시 알아야 할 3줄 요약
1. Frontend는 React로 구성되며, 화면 구성(layout), 페이지(pages), 데이터 로직(hooks)이 분리되어 있습니다.
2. `hooks/`는 REST API로 상세 데이터를 가져오고, WebSocket으로 전체 상태를 실시간 갱신합니다.
3. 데이터는 `components/`의 `Table`로 목록을 보여주고, 선택 시 `DetailPanel`에서 상세를 확인하는 흐름입니다.
