# Alert 흐름

## 무엇을 하는가

Alert는 리소스의 현재 문제를 한 목록으로 모으고, 방금 해결된 문제도 잠시 확인할 수 있게 한다. 영구 로그나 DB history가 아니라 Backend 메모리 cache다.

## Alert 생성

`RosMonitor.alerts()`가 Topic, Service, Action, Node Alert builder 결과를 합친다.

주요 예시는 다음과 같다.

| source | 조건 | code 예 |
|---|---|---|
| Topic | 메시지 미수신, stale, Graph 종료 감지 | `topic_message_missing`, `topic_stale`, `topic_disconnected` |
| Service | 허용된 active check 실패, 종료 감지 | `service_active_check_timeout`, `service_disconnected` |
| Action | aborted/canceled/result 오류, 종료 감지 | `action_goal_aborted`, `action_disconnected` |
| Node | 이전 발견 후 Graph에서 사라짐 | `node_stale` |
| MonitorStatus | 수신 메시지 level이 warning 이상 | `monitor_status_warning` 등 |

Topic missing/stale는 기존 지정 stream뿐 아니라 import 가능한 YAML 등록 msg 타입과 exact match한 Topic에도 적용된다.

## active와 resolved 생명주기

상태 기반 Alert는 `retain_alerts()`에서 다음과 같이 처리한다.

```text
장애가 계속 감지됨
→ active 유지
→ last_detected_at 갱신
→ 현재 warning/error 집계 포함

장애 조건이 사라짐
→ 즉시 resolved
→ resolved_at 기록
→ 현재 warning/error 집계 즉시 제외

resolved_at부터 60초 경과
→ 표시 cache에서 제거
```

처음 감지한 시각은 `first_detected_at`, 마지막 감지 시각은 `last_detected_at`에 저장한다.

## 같은 장애 재발

Alert identity는 리소스와 code를 조합한 안정적인 `id`로 구분한다. 해결 후 60초 안에 같은 `id`가 다시 감지되면 기존 항목이 다시 `active`가 된다.

- `resolved_at`은 `null`로 초기화
- `last_detected_at`은 재발 시각으로 갱신
- 최초 시각은 유지

해결 순간에는 별도의 resolved history snapshot도 쌓이며 최대 50개를 보관한다. Alerts 화면의 “이전 Alert” 탭이 이 history를 사용한다.

## 적용 범위

현재 안전하게 생명주기 cache를 적용하는 code는 다음과 같다.

- Topic: missing, stale, disconnected
- Service: active check timeout/error/failed, disconnected
- Action: disconnected
- Node: disconnected 의미의 `node_stale`

MonitorStatus 경고와 Action Goal 결과 같은 이벤트성 Alert는 현재 계산 결과를 그대로 통과시키는 방식이다. 모든 일회성 이벤트를 억지로 60초 stateful Alert로 바꾸지 않는다.

## 집계와 화면

`build_alert_meta()`는 `resolved`를 제외한 active Alert만 warning/error/critical 집계에 넣는다. 따라서 해결된 항목이 목록에 남아 있어도 Overview의 현재 장애 수는 즉시 감소한다.

- Overview: 접힌 상태 최근 3개, 펼치면 최근 10개
- Alerts 현재 탭: active 항목
- Alerts 이전 탭: 해결된 history 최대 50개, 초록 “해결됨”

`unknown` 리소스는 오류 Alert나 오류 집계로 취급하지 않는다.

## 메모리 정책

`_retained_alerts`와 `_alert_history`는 `RosMonitor` 메모리에 있다. Backend 재시작 시 초기화되며 DB나 파일에 영구 저장하지 않는다.

## 담당 파일

- `ros_monitor.py`: Alert 통합, 유지 대상 code, history 50개
- `topic/alerts.py`: builder, `retain_alerts()`, `build_alert_meta()`
- `service/alerts.py`, `action/alerts.py`, `node/alerts.py`: 도메인 Alert
- `frontend/src/pages/AlertsPage.jsx`: 현재/이전 탭
- `frontend/src/components/AlertsPreview.jsx`: Overview 최근 3/10개

## 문제가 생기면

1. `/ros/alerts`의 `data`, `history`, `meta`를 각각 확인
2. `alert_state`, `active`, `resolved_at`, `last_detected_at` 확인
3. 같은 문제의 `id`가 매번 바뀌지 않는지 확인
4. resolved가 meta warning/error count에 포함되지 않는지 확인
5. Backend 재시작 뒤 history 초기화는 정상 동작임을 구분
