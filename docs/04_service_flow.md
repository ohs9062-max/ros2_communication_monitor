# Service Monitoring 흐름

## 무엇을 하는가

Service Runtime은 Graph에서 Service와 Server/Client 관계를 발견하고 현재 사용 가능 여부를 표시한다. Topic처럼 지속 메시지를 받지 않으므로 Hz나 stale 대신 endpoint 존재와 제한된 active check 결과를 사용한다.

## 발견과 상태 계산

```text
get_service_names_and_types()
→ 내부/숨김 Service 분류
→ Server/Client 수와 Node 관계 수집
→ 등록 srv 타입 exact match 확인
→ 현재 상태와 발견 이력 갱신
```

기본 상태는 다음과 같다.

| 조건 | 상태 |
|---|---|
| Server 1개 이상 | `active` |
| Server 0, Client 1개 이상 | `waiting_server` |
| Server와 Client 모두 0 | `inactive` |
| 타입을 확정할 수 없음 | `unknown` |
| 이전에는 있었지만 현재 Graph에 없음 | `disconnected` |

`unknown`은 오류로 집계하지 않는다. `disconnected`는 실제로 발견된 뒤 사라진 경우만 빨간 오류로 표시한다.

## 등록 Interface와 주요 Service

`interface_registry.yaml`과 `interface_packages.yaml`의 import 가능한 srv 타입이 현재 Graph 타입과 exact match하면 API의 `allowlisted=true` 신호가 된다. Frontend는 이를 주요 Service 판정에 사용한다.

이 `allowlisted`는 background active check 허용 목록과 의미가 다르다. 타입이 등록됐다는 이유만으로 Service를 자동 호출하지 않는다.

## 세 가지 경로

### Graph Monitoring

`ServiceRuntime`이 Service 목록, 관계, 상태, disconnected를 관찰한다.

### Active check

`ServiceActiveCheckRuntime`은 `monitor.yaml`에 명시된 안전한 Service만 제한적으로 확인한다. timeout, failed, error 결과는 Alert 후보가 된다.

### 사용자 Service Call

Interface Lab의 `ServiceCallRuntime`은 사용자가 실행 버튼을 누른 경우에만 요청을 보낸다. 등록 타입과 Graph 타입이 정확히 같고 Server가 있어야 실행 후보가 된다.

## Alert

- active check `timeout`, `failed`, `error`: Service Alert
- 등록 주요 Service가 실제 발견 후 사라짐: disconnected 상태와 관련 Alert
- 단순 `waiting_server`, `unknown`: 기본 오류 Alert가 아님

Graph만으로 Server 프로세스의 정상·비정상 종료 사유를 알 수 없으므로 “종료 감지” 또는 “현재 사용 불가”로 표현한다.

## 담당 파일

- `service/runtime.py`: Graph, 상태, 관계, disconnected
- `service/active_check_runtime.py`: 설정된 안전 대상 확인
- `service/alerts.py`: Service Alert
- `interface_lab/execution/service_call_runtime.py`: 사용자 Call
- `routers/monitoring.py`, `routers/service_execution.py`: API

## 문제가 생기면

1. `/ros/services`에서 `type`, Server/Client 수, `allowlisted` 확인
2. 등록 srv의 `import_available`과 Graph `full_type` 비교
3. `waiting_server`와 `disconnected`를 구분
4. active check 문제면 `monitor.yaml` allowlist와 timeout 확인
5. 사용자 Call 문제면 callable 목록, validation, `sent_to_server` 확인
