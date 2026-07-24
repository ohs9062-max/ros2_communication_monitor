# Topic Monitoring 흐름

## 무엇을 하는가

Topic Runtime은 현재 Graph의 Topic을 발견하고, 상세 감시 가능한 메시지 타입에는 자동 Subscription을 만든다. 수신 결과로 latest, Hz, missing, stale 상태를 계산한다.

이 자동 구독은 관찰용이다. Interface Lab에서 사용자가 누르는 Receive나 Publish와는 별도 경로다.

## 지원 타입 병합

Backend가 상세 감시에 사용하는 최종 msg 타입 집합은 세 원천을 합쳐 중복 제거한다.

```text
monitor.yaml topics.supported_types
+
interface_registry.yaml의 import_available=true msg full_type
+
interface_packages.yaml의 import_available=true msg full_type
```

설정 로딩은 `config_loader.py`가 담당한다. 현재 Graph의 실제 타입과 전체 문자열이 exact match하고 generated Python message를 import할 수 있어야 Subscription을 만든다.

등록 custom msg는 별도의 preview 전용 하드코딩 목록에 들어 있지 않아도 감시할 수 있다. 메시지를 범용 JSON 형태로 완전히 예쁘게 보여주는 능력과 Subscription·수신 시각·Hz 계산 가능 여부를 같은 조건으로 묶지 않는다.

## 갱신 흐름

```text
TopicRuntime.update()
→ get_topic_names_and_types()
→ include/exclude와 내부 Topic 정책 적용
→ Publisher/Subscriber 수 계산
→ 타입 지원 여부 판정
→ 필요한 Subscription 생성 또는 재사용
→ 사라진 감시 대상 Subscription 정리
→ snapshot 갱신
```

Topic callback은 다음을 저장한다.

- 최신 메시지의 JSON-safe 값
- 마지막 수신 시각
- Hz window 안의 수신 timestamp

## latest와 Hz

`latest`는 마지막으로 받은 메시지와 수신 시각이다. `Hz`는 일정 시간 창에 들어온 수신 timestamp 간격으로 계산한다.

따라서 `supported_type=true`여도 첫 메시지가 오기 전에는 실제 Hz가 아직 없을 수 있다. 이때 “미지원”과 “아직 측정되지 않음”을 구분해야 한다.

상세 감시는 다음이 실제로 작동한다는 뜻이다.

```text
동적 Subscription
latest 저장
last_received_at 저장
Hz 계산
missing / stale 판정
```

UI 문구만 `예`로 바꾸는 기능이 아니다.

## missing과 stale

- `topic_message_missing`: Publisher가 존재하고 상세 감시 대상이지만 아직 메시지를 받지 못함
- `topic_stale`: 과거에 메시지를 받았지만 `stale_timeout_sec`보다 오래됨

기존 명시적 감시 대상뿐 아니라 import 가능한 YAML 등록 msg 타입과 exact match한 Topic도 이 Alert 대상이 된다. command 성격 Topic이나 내부 Action Topic처럼 지속 수신을 기대하면 안 되는 대상은 기본 missing/stale Alert에서 제외한다.

## Graph에서 사라진 Topic

Runtime은 `graph_present`, `ever_discovered`, `last_seen_at`, `disconnected_at`을 사용해 현재 상태를 기억한다.

- 현재 있음: 현재 연결 수와 통신 상태 표시
- 이전에 있었으나 사라짐: `disconnected`
- 한 번도 발견되지 않음: 종료 오류로 만들지 않음

Graph에서 사라진 Topic에 Subscription을 다시 만들지 않도록 타입 조회도 현재 Graph 존재 여부를 확인한다. Topic이 다시 나타나면 현재 항목으로 복구되고 필요한 Subscription이 다시 준비된다.

## 주요 Topic 판정

Backend의 `supported_type`과 상세 감시 신호가 Frontend 주요 항목 판정에 사용된다. YAML 등록 타입이라고 해서 이름만 같은 Topic을 포함하지 않고, Graph의 실제 msg `full_type`이 정확히 같아야 한다.

## 담당 파일

- `config_loader.py`: 등록 msg 타입 병합
- `topic/runtime.py`: Graph, Subscription, latest, Hz, snapshot
- `topic/alerts.py`: missing, stale, disconnected Alert
- `resource_state.py`: 발견/종료 상태 보조
- `routers/monitoring.py`: Topic API

## 문제가 생기면

1. `/ros/topics`의 `type`, `supported_type`, `graph_present` 확인
2. registry/package의 `import_available`과 `full_type` 확인
3. Backend 실행 환경에서 generated message import 확인
4. Publisher 수와 `last_received_at` 확인
5. `monitor.yaml`의 include/exclude, timeout 확인
6. Graph에서 사라진 항목이면 Subscription이 정리됐는지 확인

사용자 명시 Publish/Receive는 [12_interface_lab_flow.md](12_interface_lab_flow.md)를 참고한다.
