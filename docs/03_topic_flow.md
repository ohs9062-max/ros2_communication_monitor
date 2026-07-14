# Topic 모니터링 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Topic을 어떻게 감시하는가

Topic 이름만 보여주면 실제 메시지가 오는지 알 수 없습니다. 그래서
`TopicRuntime`은 ROS2에 존재하는 Topic을 조사하고, 지원 type은 직접 구독하여 최근
메시지, 수신 시각, Hz를 cache에 보관합니다. `RosMonitor._update_graph()`가
`TopicRuntime.update()`를 호출합니다.

## 2. 발견부터 cache 저장까지

```text
RosMonitor가 Topic 갱신 호출
  — ros_monitor.py L304-L306
  — RosMonitor._update_graph() → TopicRuntime.update()

→ ROS2 Topic 이름과 type 조회
  — topic/runtime.py L101-L114
  — TopicRuntime.update(), node.get_topic_names_and_types()

→ include/exclude와 지원 type 판단
  — topic/runtime.py L114-L124, L248-L294
  — topic/filters.py L8-L65

→ publisher/subscriber 수와 상태 조립
  — topic/runtime.py L125-L147
  — topic/discovery.py L10-L39, build_topic_item()

→ 지원 Topic subscription 생성 또는 재사용
  — topic/runtime.py L296-L345
  — TopicRuntime._ensure_subscription()

→ 완성한 Topic 목록을 cache에 저장
  — topic/runtime.py L149-L158
  — self._topics, self._last_updated
```

`update()`는 별도 인자를 받지 않고 `node_getter()`로 현재 Node를 얻습니다. Topic
이름과 type, 설정, count를 `build_topic_item()`에 전달하고 결과를 `_topics`에
저장합니다. raw subscriber 수에서는 dashboard가 만든 Topic/Action monitor 구독을
빼서 `external_subscriber_count`를 만듭니다(`topic/runtime.py` L125-L146).

Graph API는 Topic 목록과 연결 관계를 알려줄 뿐 메시지 본문을 주지는 않습니다.
메시지 본문은 subscription으로 받습니다.

## 3. 메시지가 도착했을 때

`_ensure_subscription()`은 Topic 이름과 type을 사용해 ROS2 subscription을 만듭니다.
메시지가 도착하면 실행할 callback은 `_latest_message_callback()`이 만듭니다.

```text
ROS2 메시지 도착
  — rclpy subscription이 callback 호출

→ 메시지를 안전한 preview로 변환
  — topic/runtime.py L385-L401
  — TopicRuntime._latest_message_callback()
  — topic/preview.py L13-L20, build_message_preview()

→ preview, last_received_at, timestamp 목록 저장
  — topic/runtime.py L390-L401
  — topic/subscriptions.py L39-L55

→ timestamp window로 Hz와 stale 계산
  — topic/runtime.py L403-L440
  — topic/hz.py L14-L71
```

callback은 Topic 이름, type, 실제 message를 사용합니다. 저장된 preview는 latest
API가 읽고 timestamp 목록은 Hz 계산과 Alert가 읽습니다. 사라진 Topic은 즉시
subscription을 없애지 않고 grace 시간이 지난 뒤 정리합니다
(`topic/runtime.py` L347-L383).

publisher가 존재해도 실제 메시지가 도착한다고 보장할 수는 없습니다.

## 4. REST와 화면으로 전달

```text
TopicRuntime cache
→ 목록 snapshot
  — topic/runtime.py L70-L80, TopicRuntime.snapshot()
→ RosMonitor 위임
  — ros_monitor.py L95-L97, RosMonitor.snapshot()
→ GET /ros/topics
  — main.py L54-L66, get_ros_topics()
→ Frontend polling과 화면
  — rosApi.js L26-L28
  — useTopicDashboard.js L17-L148
  — TopicsPage.jsx L13-L181
```

최근 메시지는 `TopicRuntime.latest_message()` L160-L209 → `main.py` L69-L72의
`GET /ros/topics/latest`로 전달됩니다. Hz는 `TopicRuntime.topic_hz()` L211-L246 →
`main.py` L75-L78의 `GET /ros/topics/hz`로 전달됩니다. 목록 item에 Hz가 직접
포함되는 구조는 아닙니다.

## 5. Topic Alert

`TopicRuntime.alert_snapshot()`은 Topic과 subscription cache의 복사본을 만듭니다
(`topic/runtime.py` L82-L99). `RosMonitor.alerts()`가 이를
`topic/alerts.py`의 `build_alerts()` L37-L64에 전달합니다.

required stream `/imu`, `/joint_states`, `/odom`, `/scan`은 publisher 없음, 장기
미수신, stale을 Alert로 만듭니다(`topic/alerts.py` L83-L178). 명령 Topic
`/cmd_vel`, `/cmd_vel_smoothed`는 필요할 때만 발행될 수 있어 기본 미수신 Alert에서
제외됩니다. 상태 badge가 Alert라는 뜻은 아닙니다.

## 6. 전체 흐름 한 문장

TopicRuntime이 Graph에서 Topic을 찾고 지원 type을 구독한 뒤 callback이 latest와
timestamp cache를 채우면 REST와 Alert가 그 snapshot을 읽습니다.

## 초보자가 자주 틀리는 부분

- Graph API 조회와 메시지 subscription은 서로 다른 단계입니다.
- `/ros/topics`, `/latest`, `/hz`는 서로 다른 응답입니다.
- 일반 Topic의 waiting/unsupported badge가 모두 Alert가 되는 것은 아닙니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Topic은 이름 하드코딩이 아니라 Graph API로 자동 발견합니다.
2. 실제 메시지는 subscription callback이 받아 latest와 Hz cache를 갱신합니다.
3. REST 요청은 ROS2를 다시 구독하지 않고 완성된 cache snapshot을 읽습니다.
