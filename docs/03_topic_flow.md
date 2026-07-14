# Topic 모니터링 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

Topic 발견, filter, 자동 구독, latest preview, Hz, stale/missing,
REST 응답과 Alert 생성 흐름을 설명한다.

`TopicRuntime`이 Graph와 subscription cache를 소유하고,
`RosMonitor`와 FastAPI는 결과를 위임받아 반환한다.

## 2. 전체 흐름

```text
TopicRuntime.update
→ get_topic_names_and_types
→ include/type/deep-monitor 판단
→ create_subscription
→ callback이 preview/timestamp 저장
→ latest/Hz/Alert snapshot
→ /ros/topics 계열 API
```

## 3. 단계별 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | Topic names/types 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` | L101-L114 | `TopicRuntime.update` |
| 2 | include/exclude 판단 | 같은 파일 | L114-L119, L248-L253 | `update`, `_is_topic_included` |
| 3 | 지원 type/자동 구독 판단 | 같은 파일 | L118-L124, L267-L294 | `_is_supported_type`, `_auto_subscribe_topic` |
| 4 | Pub/Sub와 monitor count 계산 | 같은 파일 | L125-L146 | `TopicRuntime.update` |
| 5 | subscription 생성/재사용 | 같은 파일 | L296-L323 | `_ensure_subscription` |
| 6 | latest preview와 timestamp 저장 | 같은 파일 | L385-L401 | `_latest_message_callback` |
| 7 | 사라진 Topic 구독 grace 정리 | 같은 파일 | L347-L383 | `_cleanup_disappeared_subscriptions` |
| 8 | Hz window/stale snapshot 계산 | 같은 파일 | L403-L440 | `_topic_hz_snapshot` |
| 9 | 목록 cache snapshot | 같은 파일 | L70-L80 | `snapshot` |
| 10 | latest API용 응답 | 같은 파일 | L160-L209 | `latest_message` |
| 11 | Hz API용 응답 | 같은 파일 | L211-L246 | `topic_hz` |
| 12 | Topic/MonitorStatus Alert 입력 복사 | 같은 파일 | L82-L99 | `alert_snapshot` |

## 4. 핵심 보조 함수

| 기능 | 파일 | 라인 | 함수 |
|---|---|---|---|
| Topic public item/status 조립 | `backend/.../topic/discovery.py` | L10-L39 | `build_topic_item` |
| include/type/deep-monitor 정책 | `backend/.../topic/filters.py` | L8-L65 | `is_topic_included`, `is_supported_type`, `should_deep_monitor` |
| timestamp window와 Hz 상태 | `backend/.../topic/hz.py` | L14-L71 | `recent_timestamps`, `hz_status`, `build_hz_snapshot` |
| type별 JSON preview | `backend/.../topic/preview.py` | L13-L20 | `build_message_preview` |
| subscription cache 갱신 | `backend/.../topic/subscriptions.py` | L39-L55 | `update_subscription_entry` |

`TopicRuntime.update` L131-L134는 raw subscriber count에서 dashboard가 만든
Topic/Action monitor subscription 수를 빼 `external_subscriber_count`를 만든다.
따라서 dashboard 자신의 구독을 외부 사용자 구독으로 오인하지 않는다.

## 5. stale/missing과 Alert

- Hz 상태 계산: `topic/hz.py` L25-L65
- required stream/command 목록: `topic/alerts.py` L24-L34
- required stream 판정: `topic/alerts.py` L83-L124
- 미수신/오래된 메시지 판정: `topic/alerts.py` L127-L178
- MonitorStatus level Alert: `topic/alerts.py` L181-L237

required stream은 `/imu`, `/joint_states`, `/odom`, `/scan`이다.
`/cmd_vel`, `/cmd_vel_smoothed`는 명령이 있을 때만 흐를 수 있어 기본 Topic
Alert에서 제외된다. 목록 badge는 별도 `topic_status` 결과이므로 유지된다.

## 6. REST와 Frontend 연결

| API | backend 위치 | frontend 호출 | 화면 흐름 |
|---|---|---|---|
| `/ros/topics` | `main.py` L54-L66 | `rosApi.js` L26-L28 | `useTopicDashboard` → `TopicsPage` → `TopicTable` |
| `/ros/topics/latest` | `main.py` L69-L72 | `rosApi.js` L30-L32 | 선택 Topic → `TopicDetailPanel` |
| `/ros/topics/hz` | `main.py` L75-L78 | `rosApi.js` L34-L36 | 목록 Hz와 상세 측정값 |

Frontend의 데이터 소유 hook은 `useTopicDashboard.js` L17-L148이고,
화면 filter/선택은 `TopicsPage.jsx` L13-L181, 표는 `TopicTable.jsx` L38-L118,
상세는 `TopicDetailPanel.jsx` L6-L145다.

## 7. 발표 때 설명할 문장

“Topic 이름을 고정해서 구독하지 않고 Graph에서 type을 발견한 뒤, 지원 type만
자동 구독해 latest와 Hz를 cache로 계산합니다.”

## 8. 헷갈리기 쉬운 부분

- `/ros/topics` item 자체에 Hz가 직접 합쳐지는 구조가 아니다.
  Hz는 선택/목록용 별도 `/ros/topics/hz` 응답이다.
- `publisher_count > 0`만으로 메시지 수신을 보장하지 않는다.
- 일반 Topic의 `waiting_publisher`, `unsupported`, `no_subscriber` badge가
  곧 `/ros/alerts` 항목이라는 뜻은 아니다.

## 9. 관련 파일 빠른 참조

`topic/runtime.py`, `topic/discovery.py`, `topic/filters.py`, `topic/hz.py`,
`topic/preview.py`, `topic/subscriptions.py`, `topic/alerts.py`, `main.py`,
`frontend/src/hooks/useTopicDashboard.js`, `frontend/src/pages/TopicsPage.jsx`
