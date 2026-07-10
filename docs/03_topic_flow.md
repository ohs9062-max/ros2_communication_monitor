# Topic 모니터링 흐름

Topic 모니터링은 현재 ROS2 시스템에서 어떤 데이터 채널이 있고, 그 데이터가 정상적으로 전달되는지 확인합니다.

## 핵심 흐름
1. **목록 가져오기**: `ros_monitor.py`의 `_update_topics`에서 `self._node.get_topic_names_and_types()`를 호출합니다.
2. **카운트 계산**: `_node.count_publishers(name)`과 `_node.count_subscribers(name)`을 사용합니다.
3. **Deep Monitoring**: 토픽 설정에 따라 실제 메시지 내용을 확인해야 하는 경우 (`should_deep_monitor`), 내부적으로 `_ensure_subscription`을 통해 해당 토픽을 구독(subscribe)합니다.
4. **Hz 계산**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/hz.py`를 통해 메시지 수신 시간 간격을 계산합니다.
5. **상태 판단**: 
   - Publisher가 없으면 `no_publisher`
   - 일정 시간 데이터가 없으면 `stale`
   - 데이터가 잘 들어오면 `active`

## 주요 API 필드 (`/ros/topics`)
- `name`: 토픽 이름
- `publisher_count`: 발행자 수
- `subscriber_count`: 구독자 수
- `status`: 현재 상태 (`active`, `stale` 등)
- `hz`: 초당 메시지 수 (메시지 빈도)

## 프론트 연결
- **Hook**: `frontend/src/hooks/useTopicDashboard.js`
- **Page**: `frontend/src/pages/TopicsPage.jsx`
- **Table**: `frontend/src/components/TopicTable.jsx`
- **Detail**: `frontend/src/components/TopicDetailPanel.jsx`

## 매핑표
| ROS2 원본값 | 백엔드 필드 | 프론트 파일 | 화면 표시 | 의미 |
| :--- | :--- | :--- | :--- | :--- |
| 토픽 이름 | name | TopicTable | 토픽 이름 컬럼 | ROS2 토픽 경로 |
| 발행자 수 | publisher_count | TopicTable | Pub | 발행하는 노드 수 |
| 구독자 수 | subscriber_count | TopicTable | Sub | 구독하는 노드 수 |
| 메시지 빈도 | hz | TopicTable | Hz | 초당 메시지 수 |

---

### 내가 반드시 알아야 할 3줄 요약
1. 백엔드는 노드를 통해 토픽 목록과 Pub/Sub 수를 주기적으로 조회합니다.
2. `Deep Monitoring`이 켜진 토픽은 실제로 구독하여 메시지 내용을 미리보고 Hz를 계산합니다.
3. 프론트는 이 정보를 받아 `TopicTable`과 `TopicDetailPanel`에 시각화합니다.
