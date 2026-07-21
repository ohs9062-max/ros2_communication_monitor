# Frontend 전체 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Frontend 구조

Frontend는 ROS2에 직접 접근하지 않는다. 모든 데이터는 `rosApi.js`의 REST/WebSocket 함수로 FastAPI Backend를 통해 받는다.

흐름은 두 가지다.

1. **모니터링 화면**: `usePolling()`과 도메인별 hook이 REST snapshot을 주기적으로 읽는다.
2. **Interface Lab**: 사용자의 등록, apply, Topic Publish/Receive, Service Call, Action Goal 버튼 동작에 맞춰 API를 호출한다.

## 2. 공통 API와 polling 코드 추적

| 단계 | 코드 위치 |
|---|---|
| REST base 요청 | `frontend/src/api/rosApi.js` L1 |
| WebSocket URL | `frontend/src/api/rosApi.js` L15 |
| latest API | `frontend/src/api/rosApi.js` L49 |
| hz API | `frontend/src/api/rosApi.js` L53 |
| alerts API | `frontend/src/api/rosApi.js` L57 |
| 공통 polling hook | `frontend/src/hooks/usePolling.js` L3 |
| App page state | `frontend/src/App.jsx` L20 |
| WebSocket hook | `frontend/src/hooks/useMonitorWebSocket.js` L6 |

`usePolling()`은 enabled, interval, resetKey 변화에 따라 기존 timer를 cleanup하고 새 polling을 시작한다. fetch 결과 state가 effect dependency에 들어가 자기 자신을 다시 호출하지 않게 유지해야 한다.

## 3. 모니터링 화면 코드 추적

| 화면 | 코드 위치 |
|---|---|
| Topic hook | `frontend/src/hooks/useTopicDashboard.js` L16 |
| Service hook | `frontend/src/hooks/useServiceDashboard.js` L9 |
| Action hook | `frontend/src/hooks/useActionDashboard.js` L9 |
| Node hook | `frontend/src/hooks/useNodeDashboard.js` L8 |
| participant map | `frontend/src/utils/participants.js` L1 |
| primary node filter | `frontend/src/utils/nodeFilters.js` L28 |

Topic 상세의 latest/hz는 선택된 Topic이 있을 때만 동작하고, topic 변경/화면 이동/unmount/reconnect에서 timer가 누적되면 안 된다.

## 4. Interface Lab 코드 추적

| 단계 | 코드 위치 |
|---|---|
| Interface Lab page | `frontend/src/pages/InterfaceLabPage.jsx` L6 |
| 초기 병렬 fetch | `frontend/src/pages/InterfaceLabPage.jsx` L78-L85 |
| topic publish 호출 | `frontend/src/pages/InterfaceLabPage.jsx` L263 |
| topic receive start | `frontend/src/pages/InterfaceLabPage.jsx` L284 |
| topic receive stop | `frontend/src/pages/InterfaceLabPage.jsx` L300 |
| 작업 도구 component | `frontend/src/components/InterfaceUploadControl.jsx` L43 |
| 작업 도구 receive history fetch | `frontend/src/components/InterfaceUploadControl.jsx` L515 |
| 작업 도구 topic receive start | `frontend/src/components/InterfaceUploadControl.jsx` L571 |
| 작업 도구 topic receive stop | `frontend/src/components/InterfaceUploadControl.jsx` L585 |
| 작업 도구 topic publish | `frontend/src/components/InterfaceUploadControl.jsx` L625 |

Interface Lab form은 Backend schema 기반으로 동적으로 생성된다. nested custom msg와 array 입력은 frontend에서 형태를 만들고, 최종 검증과 ROS2 object 변환은 backend `interface_lab/common/value_converter.py`가 담당한다.

## 5. 정책

- Frontend에 ROS2 감시 대상 이름을 하드코딩하지 않는다.
- 숨김/내부 포함 토글은 표시 대상과 상세 polling 대상에 함께 반영한다.
- WebSocket reconnect가 REST polling interval을 추가 생성하지 않게 한다.
- Interface Lab 실행 API는 사용자가 명시적으로 누른 경우에만 호출한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Frontend는 REST polling과 WebSocket 보조 채널만 사용하고 ROS2에 직접 접근하지 않는다.
2. Topic/Service/Action/Node 모니터링은 도메인 hook, Interface Lab은 사용자 액션 중심 API 호출로 분리된다.
3. polling effect에는 cleanup과 안정적인 dependency가 필수다.
