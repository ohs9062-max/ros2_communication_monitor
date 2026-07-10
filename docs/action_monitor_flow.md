# Action Monitor Flow

이 문서는 현재 코드 기준으로 ROS2 Dashboard의 Action 모니터링 데이터 흐름과
백엔드/프론트 필드 매핑을 정리한다. 기능 설명이 아니라 실제 구현된 필드가
어디서 만들어지고 화면에서 어떻게 보이는지 확인하기 위한 문서다.

## 1. 전체 흐름 요약

```text
ROS2 Action
→ backend action graph discovery
→ status topic subscription
→ feedback topic subscription
→ observed goal 기반 get_result service
→ GET /ros/actions API
→ frontend fetchActions()
→ useActionDashboard()
→ ActionsPage
→ ActionTable
→ ActionDetailPanel
→ StatusBadge
```

현재 백엔드는 Action Goal을 보내지 않는다. cancel도 보내지 않는다.
`get_result`는 새 Goal을 만드는 동작이 아니지만, 현재 구현에서는 status topic에서
이미 관찰한 terminal goal에 대해서만 제한적으로 호출한다.

## 2. 코드 기준 구성 파일

Backend:

- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/models.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/discovery.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/subscriptions.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/result_runtime.py`
- `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/alerts.py`

Frontend:

- `frontend/src/api/rosApi.js`
- `frontend/src/hooks/useActionDashboard.js`
- `frontend/src/pages/ActionsPage.jsx`
- `frontend/src/components/ActionTable.jsx`
- `frontend/src/components/ActionDetailPanel.jsx`
- `frontend/src/components/ActionSummaryCards.jsx`
- `frontend/src/components/StatusBadge.jsx`
- `frontend/src/App.css`

## 3. Backend 데이터 생성 흐름

### 3.1 Action 목록과 count

`ros_monitor.py`의 `_update_actions()`가 Action graph를 읽고 public item을 만든다.

- Action 목록/type: `get_action_names_and_types(self._node)`
- server count: node별 `get_action_server_names_and_types_by_node(...)` 결과를 Action name별 합산
- client count: node별 `get_action_client_names_and_types_by_node(...)` 결과를 Action name별 합산
- item 생성: `action/discovery.py`의 `build_action_item(...)`
- API 반환: `main.py`의 `GET /ros/actions`

`/ros/actions` 응답 wrapper:

```json
{
  "ok": true,
  "data": {
    "actions": [],
    "meta": {}
  }
}
```

### 3.2 status topic 관찰

`ros_monitor.py`는 각 Action에 대해 다음 topic을 구독한다.

```text
<action_name>/_action/status
```

type은 `action_msgs/msg/GoalStatusArray`다.
callback은 `action/subscriptions.py`의 `update_status_runtime(...)`로 이어진다.

이 로직은 status message 안의 `goal_info.goal_id.uuid`를 hex 문자열로 변환하고,
goal별 상태와 시각을 cache에 저장한다.

### 3.3 feedback topic 관찰

`ros_monitor.py`는 type import가 가능한 Action에 대해 다음 topic을 구독한다.

```text
<action_name>/_action/feedback
```

feedback message class는 `load_feedback_message_class(action_type)`에서 찾는다.
성공하면 `feedback_supported=true`, 실패하면 `feedback_supported=false`와
`feedback_reason`이 설정된다.

feedback 수신 시 `runtime.feedback_preview`에 JSON-safe preview가 저장된다.

### 3.4 result 조회

result 처리는 `action/result_runtime.py`의 `ActionResultRuntime`이 담당한다.

조건:

- `result_supported=true`
- Action type import 성공
- status topic에서 관찰한 goal_id가 있음
- goal status가 terminal 상태임
- 같은 goal_id에 대해 result 요청을 아직 하지 않음

terminal 상태:

- `succeeded`
- `canceled`
- `aborted`

GetResult service name:

```text
<action_name>/_action/get_result
```

중요: 백엔드는 Goal을 보내지 않고 cancel도 보내지 않는다. result 조회도 임의 goal_id가
아니라 status topic에서 관찰된 terminal goal_id만 대상으로 한다.

## 4. ROS2 원본 값과 백엔드/프론트 필드 매핑

### action name

- 원본: ROS2 Action graph의 action name
- 백엔드 필드: `action.name`
- 프론트 사용 위치: `ActionTable` 이름 컬럼, `ActionDetailPanel` 제목
- 화면 표시: `/navigate_to_pose` 같은 Action 이름
- 의미: Action 단위의 사용자 표시 이름

### action type

- 원본: `get_action_names_and_types(...)`의 type 목록 첫 번째 값
- 백엔드 필드: `action.type`
- 프론트 사용 위치: `ActionTable` 타입 컬럼, `ActionDetailPanel` 상태 요약
- 화면 표시: `nav2_msgs/action/NavigateToPose` 같은 type
- 의미: Action interface type

### server count

- 원본: node별 action server graph 결과 합산
- 백엔드 필드: `action.server_count`
- 프론트 사용 위치: `ActionTable` 서버 컬럼, `ActionDetailPanel` 연결 정보
- 화면 표시: 숫자
- 의미: 해당 Action server를 제공하는 node 수

### client count

- 원본: node별 action client graph 결과 합산
- 백엔드 필드: `action.client_count`
- 프론트 사용 위치: `ActionTable` 클라이언트 컬럼, `ActionDetailPanel` 연결 정보
- 화면 표시: 숫자
- 의미: 해당 Action client를 가진 node 수

### action status

- 원본: action type 유효성, server count, client count
- 백엔드 필드: `action.status`, `action.reason`
- 프론트 사용 위치: `ActionTable` 상태 컬럼, `ActionDetailPanel` 상태 요약
- 화면 표시: `정상`, `서버 대기`, `비활성`, `알 수 없음`
- 의미: Action server/client graph 기준 상태

### status topic

- 원본: Action 내부 status topic 규칙
- 백엔드 필드: `action.status_topic`
- 프론트 사용 위치: `ActionDetailPanel` 연결 정보
- 화면 표시: `<action_name>/_action/status`
- 의미: goal status 관찰에 사용하는 topic

### feedback topic

- 원본: Action 내부 feedback topic 규칙
- 백엔드 필드: `action.feedback_topic`
- 프론트 사용 위치: `ActionDetailPanel` 연결 정보
- 화면 표시: `<action_name>/_action/feedback`
- 의미: feedback preview 관찰에 사용하는 topic

### goal status

- 원본: `action_msgs/msg/GoalStatusArray.status_list[].status`
- 백엔드 필드: `runtime.last_goal_status`
- 프론트 사용 위치: `ActionTable` 마지막 Goal 컬럼, `ActionDetailPanel` Runtime
- 화면 표시: `Goal 미관찰`, `Goal 수락`, `실행 중`, `성공`, `취소됨`, `실패 종료`
- 의미: 가장 최근 status message에서 반영된 Goal 상태

### goal id

- 원본: `status_list[].goal_info.goal_id.uuid`
- 백엔드 필드: `runtime.last_goal_id`
- 프론트 사용 위치: `ActionDetailPanel` Runtime
- 화면 표시: hex 문자열 또는 `-`
- 의미: 대시보드가 마지막으로 관찰한 Goal ID

### feedback preview

- 원본: `<action_name>/_action/feedback` message의 `feedback` 필드
- 백엔드 필드: `runtime.feedback_preview`
- 프론트 사용 위치: `ActionDetailPanel` Feedback 미리보기 JSON
- 화면 표시: JSON pretty 또는 `데이터 없음`
- 의미: 최근 feedback message를 JSON-safe preview로 변환한 값

### result status

- 원본: `<action_name>/_action/get_result` response의 `status`
- 백엔드 필드: `runtime.result_status`
- 프론트 사용 위치: `ActionTable` Result 컬럼, `ActionDetailPanel` Runtime
- 화면 표시: `성공`, `실패 종료`, `취소됨`, `결과 없음`, `결과 대기` 등
- 의미: 관찰된 terminal goal에 대한 result 조회 상태

### result preview

- 원본: `<action_name>/_action/get_result` response의 `result`
- 백엔드 필드: `runtime.result_preview`
- 프론트 사용 위치: `ActionDetailPanel` Result 미리보기 JSON
- 화면 표시: JSON pretty 또는 `데이터 없음`
- 의미: result message를 JSON-safe preview로 변환한 값

### result error

- 원본: result 조회 중 발생한 예외 문자열
- 백엔드 필드: `runtime.result_error`
- 프론트 사용 위치: `ActionTable` Result 컬럼, `ActionDetailPanel` Runtime
- 화면 표시: `결과 조회 오류` 또는 상세 오류 문자열
- 의미: 관찰된 goal result 조회 실패 사유

### elapsed time

- 원본: status topic에서 관찰한 accepted/executing/terminal 수신 시각
- 백엔드 필드: `runtime.elapsed_time_ms`
- 프론트 사용 위치: `ActionTable` Elapsed 컬럼, `ActionDetailPanel` Runtime
- 화면 표시: `123.45 ms` 또는 `-`
- 의미: goal 시작 시각부터 종료 시각까지의 대략적인 관찰 시간

### observed goal count

- 원본: status topic에서 관찰해 cache에 저장한 goal 수
- 백엔드 필드: `runtime.observed_goal_count`
- 프론트 사용 위치: `ActionTable` 관찰 Goal 컬럼, `ActionSummaryCards`, 필터
- 화면 표시: 숫자
- 의미: 대시보드가 이 Action에서 본 Goal 개수

## 5. Goal 상태 매핑표

| ROS2 상태 | 백엔드 값 | 프론트 표시 | 색상 | 의미 |
| --- | --- | --- | --- | --- |
| 0 UNKNOWN | `unknown` | Goal 미관찰 | 회색 | 아직 status topic에서 유효한 Goal을 보지 못함 |
| 1 ACCEPTED | `accepted` | Goal 수락 | 파랑 | Action server가 Goal을 수락함 |
| 2 EXECUTING | `executing` | 실행 중 | 파랑 | Goal 수행 중 |
| 3 CANCELING | `canceling` | 취소 중 | 노랑 | 취소 처리 중 |
| 4 SUCCEEDED | `succeeded` | 성공 | 초록 | Goal 정상 완료 |
| 5 CANCELED | `canceled` | 취소됨 | 노랑 | Goal 취소 완료 |
| 6 ABORTED | `aborted` | 실패 종료 | 빨강 | Goal 실패 종료 |

프론트 색상은 `StatusBadge.jsx`의 `statusClass(...)` 기준이다.

## 6. Result 상태 매핑표

`ActionTable`의 Result 컬럼은 `result_policy`를 표시하지 않고 실제 상태만 표시한다.

| 조건 | 프론트 표시 | 색상 | 의미 | 정상/문제 여부 |
| --- | --- | --- | --- | --- |
| `runtime.result_status`가 `success` 또는 `succeeded` | 성공 | 초록 | result 조회 결과가 성공 상태 | 정상 |
| `runtime.result_status`가 `aborted` | 실패 종료 | 빨강 | result status가 실패 종료 | 문제 확인 필요 |
| `runtime.result_status`가 `canceled` | 취소됨 | 회색 | result status가 취소 | 상황 확인 |
| `runtime.result_status`가 `timeout` | Timeout | 빨강 | result 조회가 timeout 상태로 표시됨 | 문제 확인 필요 |
| `runtime.result_status`가 `error` | 결과 조회 오류 | 빨강 | result 조회 오류 | 문제 확인 필요 |
| `runtime.result_status`가 `unavailable` | 결과 없음 | 회색 | result 조회 불가 또는 실패 상태 | 상황 확인 |
| `runtime.result_error`가 있음 | 결과 조회 오류 | 빨강 | result 조회 중 예외 발생 | 문제 확인 필요 |
| `runtime.last_goal_status`가 `executing` | 결과 대기 | 회색 | Goal 진행 중이라 최종 result 없음 | 정상 |
| `runtime.last_goal_status`가 `accepted` | Goal 수락 | 파랑 | Goal 수락 후 진행/결과 대기 | 정상 |
| `runtime.last_goal_status`가 `canceling` | 취소 중 | 회색 | 취소 진행 중 | 상황 확인 |
| `runtime.observed_goal_count`가 `0` | Goal 미관찰 | 회색 | 서버는 있으나 Goal 실행을 아직 관찰하지 못함 | 정상 |
| 위 조건 없음 | 결과 없음 | 회색 | 표시할 result 정보 없음 | 상황 확인 |

중요:

- `observed_goal_only` 또는 `관찰된 Goal만 조회`는 Result 상태가 아니다.
- 이것은 백엔드가 새 Goal을 보내지 않고 관찰된 Goal에 대해서만 result를 조회한다는 안전 정책이다.
- 테이블에는 실제 Result 상태만 표시한다.
- 정책 설명은 `ActionDetailPanel`의 안내 문구와 지원 상태 섹션에만 표시된다.

## 7. Feedback 매핑표

현재 코드에는 `feedback_error`라는 별도 public field가 없다.
feedback type import 실패 사유는 `feedback_reason`에 표시된다.

| 조건 | 프론트 표시 | 의미 |
| --- | --- | --- |
| `feedback_supported=true` | 수신 가능 | feedback topic type import와 subscription 생성이 가능함 |
| `feedback_supported=false` | 해석 불가 | 현재 백엔드 환경에서 feedback message class를 불러오지 못했거나 monitoring disabled |
| `runtime.feedback_preview` 있음 | 상세 패널 JSON 표시 | 최근 feedback message preview가 있음 |
| `runtime.feedback_preview` 없음 | 데이터 없음 | 아직 feedback을 받지 못했거나 구독 미지원 |
| `feedback_reason` 있음 | 상세 패널 Feedback 이유 | 미지원 또는 실패 이유 |

## 8. Elapsed 시간 매핑

`elapsed_time_ms`는 `action/subscriptions.py`에서 계산된다.

계산 기준:

1. status topic에서 `accepted`를 처음 보면 `accepted_at` 저장
2. status topic에서 `executing`을 처음 보면 `executing_at` 저장
3. `succeeded`, `canceled`, `aborted`를 처음 보면 `finished_at` 저장
4. `accepted_at`이 있으면 `finished_at - accepted_at`
5. `accepted_at`이 없고 `executing_at`만 있으면 `finished_at - executing_at`
6. ms 단위로 `runtime.elapsed_time_ms`에 반영

프론트 표시:

- `ActionTable` Elapsed 컬럼: `formatMs(runtime.elapsed_time_ms)`
- `ActionDetailPanel` Runtime: `formatMs(runtime.elapsed_time_ms)`
- 값이 없으면 `-`

정상 예:

- Goal 실행 중이면 terminal 상태가 아니므로 `-`일 수 있다.
- Goal 종료 후 status topic에서 시작/종료 시각을 모두 관찰하면 `123.45 ms`처럼 표시될 수 있다.

## 9. observed_goal_count 의미

`observed_goal_count`는 대시보드가 status topic에서 관찰한 Goal 개수다.

`0`이면:

- Action Server는 떠 있을 수 있다.
- 하지만 대시보드는 아직 이 Action의 Goal 실행을 관찰하지 못했다.
- Nav2/Gazebo에서 여러 Action Server가 떠 있지만 아직 실행되지 않은 경우 정상이다.

`1` 이상이면:

- 해당 Action에서 Goal 실행 이력이 있다는 뜻이다.
- 완료된 Goal도 count에 포함된다.
- Actions 화면 기본 필터는 이 값을 포함한 runtime 관찰 이력을 기준으로 활동 Action을 먼저 보여준다.

## 10. Actions 화면 필터 흐름

`ActionsPage.jsx`는 기본적으로 동작 없는 Action Server를 숨긴다.

활동 Action 기준:

- `runtime.observed_goal_count > 0`
- 또는 top-level `observed_goal_count > 0`
- 또는 `runtime.last_goal_status`가 있고 `unknown`이 아님
- 또는 top-level `last_goal_status`가 있고 `unknown`이 아님
- 또는 `runtime.feedback_preview` 있음
- 또는 `runtime.result_preview` 있음
- 또는 `runtime.result_status` 있음
- 또는 `runtime.result_error` 있음

토글:

- 이름: `전체 Action Server 포함`
- 기본값: OFF
- OFF: 활동 Action만 표시
- ON: Goal 미관찰 Action Server까지 표시

처리 순서:

1. 전체 actions
2. 동작 없는 Action 숨김 필터
3. 상태 필터
4. 검색 필터

## 11. 사용자가 화면을 판단하는 방법

### Case 1

화면:

- 마지막 Goal = Goal 미관찰
- Result = Goal 미관찰
- 관찰 Goal = 0

판단:

서버는 떠 있지만 아직 실행된 Action이 없다. 문제 아님.

### Case 2

화면:

- 마지막 Goal = 실행 중
- Result = 결과 대기
- Elapsed = `-` 가능

판단:

Action이 진행 중이므로 최종 Result가 없는 것이 정상이다.

### Case 3

화면:

- 마지막 Goal = 성공
- Result = 성공
- Elapsed = 값 있음

판단:

정상 실행 완료.

### Case 4

화면:

- 마지막 Goal = 실패 종료
- Result = 실패 종료

판단:

Action 실행 실패. `/ros/alerts`, `result_preview`, `feedback_preview`,
`result_error`를 확인한다.

### Case 5

화면:

- Result = 결과 조회 오류
- Result 오류 = 문자열 표시

판단:

Goal 자체는 관찰됐지만 GetResult 조회에서 예외가 났다. Action type import,
GetResult service 상태, Action server 상태를 확인한다.

## 12. 프론트 정상 여부 체크리스트

브라우저 Actions 화면에서 확인한다.

- Actions 화면에 진입되는가
- 기본 상태에서 Goal 미관찰 Action Server가 숨겨지는가
- `전체 Action Server 포함`을 켜면 숨겨진 Action Server가 보이는가
- `/navigate_to_pose` 같은 Goal을 외부 Action Client가 보내면 화면에 표시되는가
- `last_goal_status`가 `accepted` 또는 `executing`으로 바뀌는가
- Goal 종료 후 `succeeded`, `aborted`, `canceled` 중 하나로 바뀌는가
- `runtime.feedback_preview`가 있으면 상세 패널 Feedback JSON에 보이는가
- `runtime.result_preview`가 있으면 상세 패널 Result JSON에 보이는가
- `runtime.elapsed_time_ms`가 있으면 Elapsed 컬럼에 ms로 보이는가
- `runtime.observed_goal_count`가 증가하는가
- Result 컬럼에 `관찰된 Goal만 조회`가 warning처럼 표시되지 않는가
- `관찰된 Goal만 조회` 정책은 상세 패널 안내로만 보이는가

## 13. 백엔드 API 확인 명령

```bash
cd ~/rang/ros2_dashboard/backend

source /opt/ros/jazzy/setup.bash
source install/setup.bash

curl "http://127.0.0.1:8000/ros/actions" \
  | python3 -m json.tool
```

확인할 JSON 필드:

- `name`
- `type`
- `server_count`
- `client_count`
- `status`
- `status_topic`
- `feedback_topic`
- `status_supported`
- `feedback_supported`
- `feedback_reason`
- `result_supported`
- `result_policy`
- `result_reason`
- `runtime.last_goal_status`
- `runtime.last_goal_id`
- `runtime.last_status_at`
- `runtime.last_feedback_at`
- `runtime.result_status`
- `runtime.result_preview`
- `runtime.result_error`
- `runtime.feedback_preview`
- `runtime.elapsed_time_ms`
- `runtime.observed_goal_count`

## 14. Action alert 매핑

`action/alerts.py`는 `/ros/alerts`에 Action alert를 합친다.

| 조건 | code | level | 의미 |
| --- | --- | --- | --- |
| `action.status == waiting_server` | `action_waiting_server` | warning | client는 있는데 server가 없음 |
| `runtime.last_goal_status == aborted` | `action_goal_aborted` | error | 마지막 Goal이 실패 종료 |
| `runtime.last_goal_status == canceled` | `action_goal_canceled` | warning | 마지막 Goal이 취소됨 |
| `runtime.result_status == unavailable` | `action_result_unavailable` | warning | result 조회 불가 |

## 15. 화면 표시값 빠른 해석표

| 화면 표시값 | 빠른 해석 |
| --- | --- |
| Goal 미관찰 | 서버는 있지만 아직 실행 안 됨 |
| Goal 수락 | Action server가 Goal을 받음 |
| 실행 중 | Action 진행 중, Result 없음 정상 |
| 결과 대기 | Goal이 아직 끝나지 않음 |
| 성공 | Action 완료 |
| 실패 종료 | Action 실패, alert/result/feedback 확인 필요 |
| 취소 중 | cancel 처리 중 |
| 취소됨 | Goal 취소 완료 |
| 관찰 Goal | 대시보드가 status topic에서 본 Goal 개수 |
| Elapsed | Goal 실행 시간, 종료 전에는 `-` 가능 |
| 관찰된 Goal만 조회 | Result 상태가 아니라 안전 조회 정책 |
