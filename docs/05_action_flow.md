# Action Monitoring 흐름

## 무엇을 하는가

Action Runtime은 Graph에서 Action Server/Client 관계를 발견하고, Action의 status와 feedback을 관찰한다. 관찰과 Goal 실행은 분리돼 있다.

Action은 내부적으로 여러 Service와 Topic을 만들지만 `/ros/actions`에서는 Action 이름 하나로 묶어 보여준다.

## 발견과 상태

```text
rclpy Action Graph API
→ Action name/type 수집
→ Server/Client Node 관계 조립
→ 등록 action 타입 exact match 확인
→ 상태와 발견 이력 갱신
```

| 조건 | 상태 |
|---|---|
| Server 1개 이상 | `active` |
| Server 0, Client 1개 이상 | `waiting_server` |
| Server와 Client 모두 0 | `inactive` |
| 타입 불명 | `unknown` |
| 이전에 있었지만 지금 없음 | `disconnected` |

등록된 import 가능 action 타입과 Graph 타입이 exact match하면 `allowlisted=true`가 되고 주요 Action 판정에 사용된다. 등록만으로 Goal을 자동 전송하지 않는다.

## status, feedback, result 관찰

Action Runtime은 다음 내부 Topic을 관찰한다.

```text
<action_name>/_action/status
<action_name>/_action/feedback
```

status code는 accepted, executing, canceling, succeeded, canceled, aborted 등으로 해석한다. Result 관찰 Runtime은 status에서 실제로 관찰된 terminal goal id에 대해서만 결과 조회를 시도한다. 새 Goal을 만들어 상태를 시험하지 않는다.

## 사용자 Goal 실행과의 구분

Monitoring:

- 현재 Action과 관계 관찰
- status/feedback/result 상태 기록
- Goal을 보내지 않음

Interface Lab:

- 사용자가 선택하고 실행한 경우만 Goal 전송
- schema validation 후 전송
- accepted/rejected, timeout, feedback, result history 저장

두 경로가 같은 action 타입을 사용해도 client cache와 실행 책임은 분리된다.

## Alert와 disconnected

- 마지막 Goal 상태 `aborted`: `action_goal_aborted`
- 마지막 Goal 상태 `canceled`: `action_goal_canceled`
- 결과 조회 오류: `action_result_unavailable`
- 등록 주요 Action이 실제 발견 후 사라짐: disconnected

Goal을 한 번도 관찰하지 않은 상태나 단순 `waiting_server`는 기본 오류가 아니다. Graph는 종료 원인을 알려주지 않으므로 “비정상 종료”라고 단정하지 않는다.

## 담당 파일

- `action/runtime.py`: Graph, status/feedback, 상태
- `action/result_runtime.py`: 관찰된 terminal Goal 결과
- `action/alerts.py`: Action Alert
- `interface_lab/execution/action_goal_runtime.py`: 사용자 Goal
- `routers/monitoring.py`, `routers/action_execution.py`: API

## 문제가 생기면

1. `/ros/actions`의 name/type, Server/Client 수, `allowlisted` 확인
2. 등록 action `full_type`과 Graph 타입 비교
3. 내부 status/feedback Topic이 실제 존재하는지 확인
4. 관찰된 Goal인지 사용자가 Interface Lab에서 실행한 Goal인지 구분
5. `disconnected`라면 `ever_discovered`와 `disconnected_at` 확인
