# API 필드 매핑

각 API가 제공하는 주요 JSON 필드와 프론트엔드 연결 정보입니다.

| API | JSON 필드 | 뜻 | 화면 표시 |
| :--- | :--- | :--- | :--- |
| /ros/topics | `name` | 토픽 이름 | TopicTable |
| /ros/topics | `hz` | 메시지 빈도 | TopicTable |
| /ros/services | `name` | 서비스 이름 | ServiceTable |
| /ros/services | `response_time_ms`| 응답 시간 | ServiceTable |
| /ros/actions | `name` | 액션 이름 | ActionTable |
| /ros/actions | `runtime.last_goal_status`| 현재 Goal 상태 | ActionTable |
| /ros/nodes | `full_name` | 노드 전체 이름 | NodeTable |
| /ros/nodes | `status` | 상태 (active/stale) | NodeTable |
| /ros/alerts | `type` | 알림 종류 | AlertsList |

---

### 내가 반드시 알아야 할 3줄 요약
1. 백엔드 API 데이터는 대부분 `data` 필드 내부에 리스트 형태로 존재합니다.
2. 각 페이지의 Table은 API 데이터를 받아 행 단위로 화면에 출력합니다.
3. `/ws/monitor` API는 모든 요소를 포함한 전체 스냅샷을 1초마다 보냅니다.
