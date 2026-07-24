# 핵심 개념

## ROS2 통신 구성요소

### Node

Node는 ROS2에서 동작하는 실행 주체다. 하나의 Node가 Topic을 발행·구독하고, Service나 Action의 Server·Client가 될 수 있다.

### Topic

Topic은 Publisher가 메시지를 계속 발행하고 Subscriber가 받는 비동기 통신 통로다. Publisher가 사라져도 Topic 이름 자체를 영구 객체처럼 보관하는 중앙 서버는 없다. Graph에서 관련 endpoint가 모두 사라지면 Topic도 현재 목록에서 사라진다.

### Service

Service는 Client의 요청에 Server가 한 번 응답하는 통신이다. 지속 메시지가 없으므로 Topic의 Hz나 stale 개념을 그대로 적용하지 않는다.

### Action

Action은 오래 걸리는 작업을 위한 통신이다. Goal을 보내고, 실행 중 Feedback을 받으며, 마지막에 Result를 받는다. 내부적으로 Topic과 Service를 사용하지만 화면에서는 Action 단위로 묶는다.

### ROS2 Graph

Graph는 현재 발견되는 Node와 통신 endpoint의 관계 정보다. “지금 보인다”는 사실은 알 수 있지만 프로세스 종료 사유까지 알려주지는 않는다.

## Dashboard 내부 개념

### Runtime

Runtime은 특정 영역의 Graph 조회, 상태 계산, Subscription 또는 cache 관리를 맡는 Backend 객체다. 예를 들어 `TopicRuntime`, `ServiceRuntime`, `ActionRuntime`, `NodeRuntime`이 있다.

### Cache와 snapshot

Runtime은 ROS callback이나 주기 갱신 결과를 메모리 cache에 저장한다. API는 ROS2를 매 요청마다 새로 조회하지 않고 lock으로 보호된 snapshot을 반환한다.

### exact match

등록 타입과 실제 통신 타입의 전체 문자열이 정확히 같아야 같은 Interface로 본다. 이름 일부나 파일명만 비교하지 않는다.

## 상태 용어

| 상태 | 의미 | 기본 표시 |
|---|---|---|
| `active` | 현재 사용 가능한 endpoint가 있음 | 정상 |
| `waiting_server` | Client는 있지만 Server가 없음 | 대기/주의 |
| `inactive` | 현재 Server와 Client가 없음 | 중립 |
| `stale` | 메시지를 받았지만 허용 시간보다 오래됨 | 경고 |
| `missing` | Publisher가 있으나 아직 메시지를 받지 못함 | 경고 |
| `disconnected` | 이전에 발견됐지만 지금 Graph에서 사라짐 | 오류 |
| `unknown` | 타입 또는 상태를 확정할 정보가 부족함 | 중립 |
| `resolved` | 과거 Alert의 원인이 해결됨 | 해결됨 |

`unknown`은 오류 집계에 넣지 않는다. `disconnected`는 실제로 한 번 발견된 리소스에만 적용하고 빨간 오류로 표시한다.

## 리소스 상태 기억

Backend의 공통 상태 보조 로직은 다음 값을 다룬다.

- `graph_present`: 이번 갱신에서 Graph에 존재하는가
- `ever_discovered`: Backend 실행 이후 한 번이라도 발견됐는가
- `last_seen_at`: 마지막으로 Graph에서 본 시각
- `disconnected_at`: 존재하다 사라진 시각

현재 발견되면 `graph_present=true`, `ever_discovered=true`가 된다. 이후 사라질 때만 `disconnected`로 전환한다. 설정에 타입이 등록됐지만 Graph에서 한 번도 발견되지 않은 대상은 빨간 종료 상태로 만들지 않는다.

## 주요 항목

주요 항목은 등록 여부만이 아니라 실제 Graph 통신과의 연결로 판정한다.

- msg 등록 타입과 일치하는 Topic
- srv 등록 타입과 일치하는 Service
- action 등록 타입과 일치하는 Action
- 위 통신을 실제로 발행·구독하거나 Server·Client로 사용하는 Node

기존 기본 주요 항목 규칙과 숨김·내부 항목 제외 규칙도 유지된다. 상세 판정은 [09_frontend_flow.md](09_frontend_flow.md)에 정리돼 있다.

## Monitoring과 Interface Lab

Monitoring은 자동 관찰 경로다. 등록 msg는 자동 상세 감시 대상이 될 수 있지만, 이 기능이 메시지를 발행하거나 Service·Action을 실행하지는 않는다.

Interface Lab은 사용자 실행 경로다.

- Publish: 사용자가 메시지를 발행
- Receive: 사용자가 선택한 Topic을 별도로 구독
- Call: 사용자가 Service 요청 전송
- Goal: 사용자가 Action Goal 전송

두 경로가 같은 등록 Interface를 참고하더라도 Runtime과 책임은 분리돼 있다.
