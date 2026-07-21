# Topic 모니터링 및 실행 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Topic의 두 경로

Topic은 자동 모니터링과 Interface Lab 명시 실행으로 나뉜다.

- **Topic 모니터링**: Graph discovery, supported type 자동 구독, latest/hz/stale/alert cache.
- **Interface Lab Topic 실행**: 사용자가 Message `full_type`과 topic name을 지정해 publish 또는 receive start/stop을 수행.

## 2. Topic 모니터링 코드 추적

```text
RosMonitor timer
→ TopicRuntime.update()
→ Graph API로 topic/type/publisher/subscriber 수집
→ supported type subscription 유지
→ latest/hz/cache 갱신
→ REST latest/hz endpoint가 cache 조회
```

| 단계 | 코드 위치 |
|---|---|
| TopicRuntime 생성/상태 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L41 |
| cache clear | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L63 |
| topic snapshot | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L70 |
| Graph update | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L120 |
| latest 조회 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/runtime.py` L179 |
| message preview 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/preview.py` L13 |
| subscription entry 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/subscriptions.py` L39 |
| Hz 계산 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/hz.py` L25 |
| `/ros/topics` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L16 |
| `/ros/topics/latest` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L31 |
| `/ros/topics/hz` router | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/monitoring.py` L37 |

## 3. Interface Lab Topic 실행 코드 추적

```text
Frontend form
→ topic execution router
→ InterfaceReceiveRuntime
→ value_converter로 schema/validation/object 변환
→ rclpy Publisher 또는 Subscription
→ history 저장
```

| 단계 | 코드 위치 |
|---|---|
| callable message endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L14 |
| message schema endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L26 |
| topic publish endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L40 |
| receive start endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L99 |
| receive stop endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L117 |
| receive history endpoint | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/routers/topic_execution.py` L138 |
| InterfaceReceiveRuntime | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L30 |
| message schema 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L64 |
| callable message 판단 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L80 |
| receive start | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L113 |
| receive stop | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L167 |
| receive history | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L205 |
| receive history reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L232 |
| publish | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L273 |
| publish history | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L350 |
| publish history reset | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/execution/topic_runtime.py` L357 |
| ROS message 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L37 |
| JSON-safe 변환 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L122 |
| schema helper | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_lab/common/value_converter.py` L130 |

## 4. Frontend polling 코드 추적

Topic 상세의 latest/hz polling은 `usePolling`으로 관리한다. 선택 topic, 화면 활성 상태, 숨김 포함 필터가 바뀌면 이전 timer를 cleanup해야 한다.

| 단계 | 코드 위치 |
|---|---|
| polling hook | `frontend/src/hooks/usePolling.js` L3 |
| Topic dashboard hook | `frontend/src/hooks/useTopicDashboard.js` L16 |
| selected topic hz fetcher | `frontend/src/hooks/useTopicDashboard.js` L43 |
| participant map | `frontend/src/hooks/useTopicDashboard.js` L62 |
| topic list hz 보강 | `frontend/src/hooks/useTopicDashboard.js` L98 |
| latest API 함수 | `frontend/src/api/rosApi.js` L49 |
| hz API 함수 | `frontend/src/api/rosApi.js` L53 |

## 5. 정책

- Topic monitoring subscription과 Interface Lab receive subscription은 서로 다른 runtime이다.
- Interface Lab Publish/Receive는 `(topic_name, full_type)` 기준으로 cache/history를 관리한다.
- 같은 Topic 이름 + 같은 full_type은 허용하고, 같은 Topic 이름 + 다른 full_type은 conflict로 표시한다.
- validation 실패 시 ROS2 publish를 차단하고 `sent_to_topic=false`로 기록한다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Topic 자동 모니터링은 `topic/runtime.py`, 사용자가 누르는 Publish/Receive는 `interface_lab/execution/topic_runtime.py`가 담당한다.
2. latest/hz는 REST polling으로 cache를 읽으며, timer cleanup이 누락되면 요청 폭주가 난다.
3. Interface Lab Topic 실행은 `(topic_name, full_type)` exact 기준으로 동작한다.
