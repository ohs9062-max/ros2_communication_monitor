# Topic 모니터링 및 수신 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Topic 모니터링 vs Topic Publish/Receive

이 프로젝트에서 Topic은 두 가지 독립적인 경로로 다루어집니다.

- **Topic 모니터링 (Graph)**: 시스템 전체 Topic의 존재, 연결 상태, 메시지 수신 Hz/Latest를 자동으로 감시.
- **Topic Publish/Receive (Interface Lab)**: 사용자가 등록된 Message `full_type`을 선택해 1회 Publish하거나 특정 `(topic_name, full_type)` 구독을 시작/정지하고 history를 저장.

## 2. Topic 모니터링 흐름

`TopicRuntime`은 ROS2에 존재하는 Topic을 조사하고, 지원 type은 직접 구독하여 최근 메시지, 수신 시각, Hz를 cache에 보관합니다. `RosMonitor._update_graph()`가 `TopicRuntime.update()`를 호출합니다.

## 3. Interface Lab: Topic Publish/Receive 흐름

`InterfaceReceiveRuntime`(`interface_lab/execution/topic_runtime.py`)을 통해 처리됩니다.

- **Message 목록/schema**: `GET /ros/interfaces/callable-messages`, `GET /ros/interfaces/message-schema?full_type=...`로 등록된 msg와 schema를 조회.
- **Publish**: `POST /ros/interfaces/topic-publish`가 Message schema를 기준으로 payload를 generated message로 변환한 뒤 1회 publish.
- **Publish history**: `GET /ros/interfaces/topic-publish/history`, `POST /ros/interfaces/topic-publish/history/reset`.
- **Subscribe 시작**: `POST /ros/interfaces/receive/topics/start` 요청을 받아 `(topic_name, topic_type)` 기준 구독 시작.
- **Subscribe 중지**: `POST /ros/interfaces/receive/topics/stop` 요청으로 해당 조합의 ROS2 Subscription만 중단하고, 이미 쌓인 history는 reset 전까지 보존.
- **Subscribe history**: `GET /ros/interfaces/receive/topics/history`, `POST /ros/interfaces/receive/topics/history/reset`.
- **데이터**: publish payload와 수신 메시지는 JSON-safe 형태로 저장되며 nested msg와 msg array도 `ros_message_to_json()` 경로를 통해 표시됩니다.
- **구조**: 일반 모니터링 구독과는 별개의 Runtime 객체로 관리됩니다.

Topic Subscribe는 같은 Topic 이름이라도 Message `full_type`이 다르면 별도 구독으로 봅니다.
중복 방지는 `topic_name` 하나가 아니라 `(topic_name, topic_type)` key를 기준으로 수행합니다.
Publish도 Publisher cache를 `(topic_name, topic_type)` 기준으로 재사용합니다.
새 Publisher를 만든 첫 Publish는 ROS2 discovery 시간을 짧게 준 뒤 전송하여, 외부 echo/subscriber가 첫 메시지를 놓칠 가능성을 줄입니다.

Graph에 같은 Topic 이름으로 다른 type이 있으면 `graph_state.conflicts`와 warning을 반환합니다.
Publish는 subscriber가 없어도 가능하지만 `subscriber_count=0` 상태가 응답에 포함됩니다.

## 4. 모니터링 메시지 수신 및 캐시 갱신

```text
ROS2 메시지 도착 (모니터링 구독)
  — rclpy subscription이 callback 호출

→ 메시지를 안전한 preview로 변환
  — topic/preview.py L13-L20, build_message_preview()

→ preview, last_received_at, timestamp 목록 저장
  — topic/subscriptions.py L39-L55

→ timestamp window로 Hz와 stale 계산
  — topic/hz.py L14-L71
```

## 5. 자주 틀리는 이해

- **모니터링과 Receive는 별개입니다**: Topic 목록에 보인다고 해서 Interface Lab의 Receive를 통해 메시지가 저장되는 것은 아닙니다.
- **Publish도 자동 실행되지 않습니다**: 등록된 Message가 있어도 사용자가 버튼을 눌러야 1회 Publish됩니다.
- **데이터 흐름**: 모니터링은 Graph API와 자동 구독을 통해 이루어지며, Publish/Receive는 사용자 API 요청에 의해서만 시작됩니다.
- **full_type이 중요합니다**: 같은 Message 이름이라도 package가 다르면 다른 type입니다. Graph `types[0]`을 임의 선택하면 안 됩니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Topic은 '시스템 전체 모니터링(Graph)'과 '사용자 중심 Publish/Receive(Interface Lab)'로 구분됩니다.
2. 모니터링은 `TopicRuntime`이, Topic Publish/Receive는 `InterfaceReceiveRuntime`이 담당합니다.
3. Interface Lab Topic 작업은 `(topic_name, full_type)` 기준이며 사용자가 버튼을 눌렀을 때만 publish/subscribe가 시작됩니다.
