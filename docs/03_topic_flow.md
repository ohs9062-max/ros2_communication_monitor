# Topic 모니터링 및 수신 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Topic 모니터링 vs Topic 수신 (Receive)

이 프로젝트에서 Topic은 두 가지 독립적인 경로로 다루어집니다.

- **Topic 모니터링 (Graph)**: 시스템 전체 Topic의 존재, 연결 상태, 메시지 수신 Hz/Latest를 자동으로 감시.
- **Topic Receive (Interface Lab)**: 사용자가 Interface Lab에서 특정 Topic의 구독을 시작/정지하고 메시지를 미리보기 및 히스토리로 저장.

## 2. Topic 모니터링 흐름

`TopicRuntime`은 ROS2에 존재하는 Topic을 조사하고, 지원 type은 직접 구독하여 최근 메시지, 수신 시각, Hz를 cache에 보관합니다. `RosMonitor._update_graph()`가 `TopicRuntime.update()`를 호출합니다.

## 3. Interface Lab: Topic Receive 흐름

`InterfaceReceiveRuntime`(`interface_receive_runtime.py`)을 통해 처리됩니다.

- **기능**: 사용자의 시작(`POST /ros/interfaces/receive/topics/start`) 요청을 받아 구독 시작.
- **데이터**: 수신된 메시지는 미리보기 형태로 저장되며, history에 보관됩니다.
- **종료**: `POST /ros/interfaces/receive/topics/stop` 요청으로 구독 중단.
- **구조**: 일반 모니터링 구독과는 별개의 Runtime 객체로 관리됩니다.

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
- **데이터 흐름**: 모니터링은 Graph API와 자동 구독을 통해 이루어지며, Receive는 사용자 API 요청에 의해서만 구독이 시작됩니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Topic은 '시스템 전체 모니터링(Graph)'과 '사용자 중심 수신(Interface Lab)'으로 구분됩니다.
2. 모니터링은 `TopicRuntime`이, Topic Receive는 `InterfaceReceiveRuntime`이 담당합니다.
3. 모니터링의 구독 callback과 Receive의 구독 callback은 독립적으로 동작합니다.
