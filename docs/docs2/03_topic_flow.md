# Topic 모니터링 및 실행 흐름

> 라인 번호는 2026-07-21 실제 코드 기준이다.

## 1. Topic의 두 경로

Topic은 자동 모니터링과 Interface Lab 명시 실행으로 나뉜다.

- **Topic 모니터링**: Graph discovery, supported type 자동 구독, latest/hz/stale/alert cache.
- **Interface Lab Topic 실행**: 사용자가 Message `full_type`과 topic name을 지정해 publish 또는 receive start/stop을 수행.

두 경로를 반드시 구분해야 한다. Topic 모니터링은 Dashboard가 현재 ROS2 Topic 상태를 보기 위한 자동 관찰이고, Topic 실행은 Interface Lab에서 사용자가 직접 Topic 메시지를 보내거나 특정 Topic 수신을 켜는 기능이다.

| 구분 | 자동 모니터링 | Interface Lab 실행 |
|---|---|---|
| 시작점 | `RosMonitor` timer | 사용자의 버튼 클릭 |
| Router | `/ros/topics`, `/ros/topics/latest`, `/ros/topics/hz` | `/ros/interfaces/callable-messages`, `/message-schema`, `/topic-publish`, `/receive/topics/*` |
| Runtime | `topic/runtime.py` L41 | `interface_lab/execution/topic_runtime.py` L30 |
| 목적 | 상태 관찰, latest, Hz, stale 판단 | publish, receive start/stop, history |
| 주의점 | topic 이름을 하드코딩하지 않음 | 사용자가 명시한 topic/type만 실행 |

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

## 5. `/ros/topics`를 라인으로 따라가기

```text
Frontend Topic 화면
→ GET /ros/topics
→ routers/monitoring.py L16 @router.get('/ros/topics')
→ routers/monitoring.py L17 get_ros_topics()
→ routers/monitoring.py L19 ros_monitor.snapshot()
→ ros_monitor.py L113 RosMonitor.snapshot()
→ topic/runtime.py L70 TopicRuntime.snapshot()
→ topic/runtime.py L72-L82 lock 안에서 topics/subscriptions 복사
→ topic/runtime.py L84-L93 latest/observed/message_count 보강
→ topic/runtime.py L95-L99 topics/count/last_updated 반환
→ routers/monitoring.py L20-L28 success/data/meta/message JSON 반환
→ Frontend Topic list 표시
```

이 흐름에서 `TopicRuntime.update()`는 호출되지 않는다. `update()`는 timer가 이미 실행해 둔 갱신 작업이고, REST는 snapshot만 읽는다.

## 6. Topic Graph 갱신을 라인으로 따라가기

```text
ros_monitor.py L531 _update_graph()
→ topic/runtime.py L120 TopicRuntime.update()
→ L122-L124 rclpy node 없으면 return
→ L128 node.get_topic_names_and_types()
→ L133-L135 include/exclude filter 적용
→ L137-L143 type 확인 및 auto subscription 판단
→ L144 node.count_publishers(name)
→ L145 node.count_subscribers(name)
→ L146-L153 monitor subscription 수를 빼서 external subscriber 계산
→ L154-L166 build_topic_item()
→ L170-L172 lock 안에서 topic cache 교체
→ L174-L177 사라진 topic subscription 정리
```

## 7. `/ros/topics/latest`와 `/ros/topics/hz`

`/ros/topics/latest`는 선택 Topic의 최신 message preview를 읽는 endpoint다.

```text
routers/monitoring.py L31 @router.get('/ros/topics/latest')
→ L32 get_latest_ros_topic(name)
→ L34 ros_monitor.latest_message(name)
→ ros_monitor.py L368 RosMonitor.latest_message()
→ topic/runtime.py L179 TopicRuntime.latest_message()
→ topic이 없거나 unsupported면 실패 JSON
→ supported type이면 subscription 보장 후 cache의 preview 반환
```

`/ros/topics/hz`는 선택 Topic의 최근 수신 주파수를 읽는 endpoint다.

```text
routers/monitoring.py L37 @router.get('/ros/topics/hz')
→ L38 get_ros_topic_hz(name)
→ L40 ros_monitor.topic_hz(name)
→ ros_monitor.py L372 RosMonitor.topic_hz()
→ topic/runtime.py L230 TopicRuntime.topic_hz()
→ 최근 timestamp window 기반 Hz snapshot 반환
```

## 8. Interface Lab Topic 실행을 라인으로 따라가기

Topic Publish는 다음 흐름이다.

```text
Frontend Interface Lab form
→ POST /ros/interfaces/topic-publish
→ routers/topic_execution.py L40 endpoint
→ L41 publish_registered_topic()
→ L43-L58 JSON body와 topic_name/topic_type/message 검증
→ L61-L65 ros_monitor.publish_topic(...)
→ ros_monitor.py L302 RosMonitor.publish_topic()
→ interface_lab/execution/topic_runtime.py L273 publish_topic()
→ value_converter.py L37 ROS message object 생성
→ publish history 저장
→ Router가 성공/실패 JSON 반환
```

Topic Receive start는 다음 흐름이다.

```text
POST /ros/interfaces/receive/topics/start
→ routers/topic_execution.py L99 endpoint
→ L100 start_receive_topic()
→ L107-L111 ros_monitor.start_receive_topic(...)
→ ros_monitor.py L252 RosMonitor.start_receive_topic()
→ interface_lab/execution/topic_runtime.py L113 start_topic()
→ 지정 topic/type subscription 생성
→ 수신 callback이 history 저장
```
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
