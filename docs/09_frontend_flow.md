# Frontend 전체 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Frontend 구조

Frontend는 ROS2에 직접 접근하지 않는다. 모든 데이터는 `rosApi.js`의 REST/WebSocket 함수로 FastAPI Backend를 통해 받는다.

흐름은 두 가지다.

1. **모니터링 화면**: `usePolling()`과 도메인별 hook이 REST snapshot을 주기적으로 읽는다.
2. **Interface Lab**: 사용자의 등록, apply, Topic Publish/Receive, Service Call, Action Goal 버튼 동작에 맞춰 API를 호출한다.

Frontend의 핵심 원칙은 "ROS2를 직접 만지지 않는다"이다. React/Electron은 ROS2 graph나 rclpy를 모르고, FastAPI가 제공하는 JSON만 읽는다.

```text
React page
→ domain hook
→ frontend/src/api/rosApi.js
→ FastAPI endpoint
→ Backend runtime snapshot 또는 Interface Lab execution 결과
→ JSON 응답
→ hook state
→ page/component 렌더링
```

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

### Topic 화면을 라인으로 따라가기

```text
frontend/src/App.jsx L20 page state
→ Topic page 활성
→ frontend/src/hooks/useTopicDashboard.js L16 hook 시작
→ rosApi.js의 topics/latest/hz API 호출
→ Backend routers/monitoring.py L16, L31, L37
→ 응답 JSON을 hook state로 저장
→ Topic page/component가 목록과 상세 표시
```

Topic 상세 latest/hz polling은 선택된 Topic이 있을 때만 의미가 있다. 숨김 포함 필터가 꺼져 선택 Topic이 사라지면 selected topic을 안정적으로 비워야 한다.

### Service/Action/Node 화면을 라인으로 따라가기

```text
Service 화면
→ useServiceDashboard.js L9
→ GET /ros/services
→ routers/monitoring.py L43

Action 화면
→ useActionDashboard.js L9
→ GET /ros/actions
→ routers/monitoring.py L60

Node 화면
→ useNodeDashboard.js L8
→ GET /ros/nodes
→ routers/monitoring.py L73
```

세 화면 모두 Backend runtime cache snapshot을 읽는다. 화면 진입이 ROS2 Service Call이나 Action Goal 실행을 유발하면 안 된다.

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

### Interface Lab 실행을 라인으로 따라가기

```text
frontend/src/pages/InterfaceLabPage.jsx L6 page
→ L78-L85 초기 registry/package/callable/apply 상태 fetch
→ frontend/src/components/InterfaceUploadControl.jsx L43 작업 도구 UI
→ 사용자가 버튼 클릭
→ rosApi.js API 함수 호출
→ Backend interface router
→ Backend가 validation/build/execution 수행
→ JSON 결과 반환
→ Frontend가 registry/history/callable/apply 상태 재조회
```

예를 들어 Topic Publish는 Frontend에서 `InterfaceLabPage.jsx` L263 또는 작업 도구의 `InterfaceUploadControl.jsx` L625 근처에서 호출되고, Backend는 `routers/topic_execution.py` L40으로 들어간다. Service Call은 Backend `routers/service_execution.py` L26, Action Goal은 `routers/action_execution.py` L26으로 들어간다.

## 5. 정책

- Frontend에 ROS2 감시 대상 이름을 하드코딩하지 않는다.
- 숨김/내부 포함 토글은 표시 대상과 상세 polling 대상에 함께 반영한다.
- WebSocket reconnect가 REST polling interval을 추가 생성하지 않게 한다.
- Interface Lab 실행 API는 사용자가 명시적으로 누른 경우에만 호출한다.
- Frontend는 Backend 응답의 기존 JSON key를 제거하거나 새 구조로 가정하지 않는다.
- participant map은 `/ros/nodes` 응답을 Frontend에서 역매핑해 만들며, Backend API 구조를 바꾸지 않는다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Frontend는 REST polling과 WebSocket 보조 채널만 사용하고 ROS2에 직접 접근하지 않는다.
2. Topic/Service/Action/Node 모니터링은 도메인 hook, Interface Lab은 사용자 액션 중심 API 호출로 분리된다.
3. polling effect에는 cleanup과 안정적인 dependency가 필수다.
