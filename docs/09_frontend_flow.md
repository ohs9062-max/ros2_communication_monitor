# Frontend 전체 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Frontend 구조 개요

Frontend는 ROS2에 직접 접근하지 않으며 FastAPI REST 응답을 폴링(polling)하여 상태를 관리합니다. 전체 흐름은 크게 두 부분으로 나뉩니다.

1. **기존 모니터링 페이지**: 공통 `usePolling()` 및 도메인별 hook을 통해 주기적으로 상태 수집.
2. **Interface Lab**: 동적 인터페이스 등록 및 상호작용을 담당하는 페이지로, 일반적인 모니터링 흐름과 독립적인 API 호출 및 상태 관리 수행.

## 2. Interface Lab 흐름 (InterfaceLabPage)

`InterfaceLabPage.jsx`는 다른 모니터링 페이지와는 다른 구조를 가집니다.

- **독립적 상태 관리**: 주기적인 전체 Polling보다는 사용자 액션(업로드, 적용, 호출)에 반응하는 상태를 주로 사용.
- **동적 Form**: Backend에서 받아온 ROS2 인터페이스 스키마 기반으로 Form을 동적으로 생성.
- **API 호출**: `rosApi.js` 내 정의된 인터페이스 관련 API(`service-call`, `action-goal` 등)를 직접 호출하여 Backend와 상호작용.

```text
InterfaceLabPage 사용자 입력
  → Form 유효성 검사 및 데이터 변환
  → rosApi.js를 통해 REST API 전송 (service-call, action-goal, topic-publish, receive/topics)
  → Backend 응답 확인 (히스토리 저장)
  → UI 갱신 (결과 표시)
```

## 3. 화면별 코드 위치 (요약)

| 화면 | 주요 기능 | 주요 파일/hook |
|---|---|---|
| 모니터링 페이지 | 목록, 상태 관찰 | `use*Dashboard.js`, `*Page.jsx` |
| Interface Lab | 인터페이스 등록, Topic Publish/Subscribe, 서비스 호출, 액션 실행 | `InterfaceLabPage.jsx`, `InterfaceUploadControl.jsx` |

## 4. Interface Lab Topic UI

Message 항목을 선택하면 `InterfaceLabPage.jsx`의 Message 상세 패널에서 Topic 작업 영역을 표시합니다.
또한 상단 작업 도구의 `InterfaceUploadControl.jsx`에서 `수신` → `Topic 수신`을 열면, 등록된 Message `full_type` 선택, Topic Publish, Topic Subscribe, Publish/Subscribe history가 같은 화면에 표시됩니다.

- `fetchCallableMessages()`로 등록/import 가능한 Message 목록과 schema를 가져옵니다.
- Message `full_type`을 기준으로 registry row, package row, ROS graph topic row를 병합합니다.
- Publish 영역은 topic 이름과 schema 기반 동적 form을 보여주고, 사용자가 `1회 Publish` 버튼을 눌렀을 때만 `publishTopicMessage()`를 호출합니다.
- Subscribe 영역은 topic 이름과 선택된 Message `full_type`으로 `startReceiveTopic()` / `stopReceiveTopic()`을 호출합니다.
- Publish/Subscribe history는 `fetchTopicPublishHistory()`와 `fetchReceiveTopicHistory()`로 읽고, reset API로 초기화합니다. Subscribe Stop은 구독만 중지하며 기존 history는 화면에 남깁니다.

Service/Action form에서 쓰는 `RequestField`, `defaultValues()`, `normalizeNumericValues()`를 Message form에서도 재사용합니다.
nested custom msg와 msg array는 JSON textarea로 입력하고, 최종 검증은 backend의 `interface_lab/common/value_converter.py`가 수행합니다.

## 5. 자주 틀리는 이해

- **통합 vs 독립**: 모니터링 페이지들은 공통 Polling을 사용하지만, Interface Lab 페이지는 사용자의 인터랙션 기반 호출을 주로 사용하여 흐름이 분리되어 있습니다.
- **Form 동적 생성**: Interface Lab의 Form은 하드코딩되지 않고 Backend가 제공하는 메시지 스키마를 기반으로 런타임에 동적으로 생성됩니다.
- **Topic은 요청/응답이 아닙니다**: Publish는 1회 전송이고 Subscribe는 지속 수신입니다. Service response나 Action result처럼 즉시 한 쌍으로 끝나는 흐름이 아닙니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Frontend는 '주기적 모니터링(Polling)'과 'Interface Lab의 사용자 상호작용(API 호출)'이라는 두 가지 흐름으로 동작합니다.
2. `InterfaceLabPage`는 Message/Service/Action 모두 동적 스키마 기반 Form을 사용합니다.
3. 모든 Backend API 통신은 `rosApi.js`를 통해 이루어지며, 모니터링과 실행 기능이 이 API를 통해 통합됩니다.
