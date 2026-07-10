# Action 모니터링 흐름

Action은 오래 걸리는 작업을 위한 통신이며, 내부적으로 3개의 서비스와 2개의 토픽을 사용합니다. 이 대시보드는 이 복잡한 구조를 추적하여 액션의 진행 상태를 보여줍니다.

## 내부 구조
액션은 다음으로 구성됩니다:
- `send_goal` (Service): 목표 전송
- `get_result` (Service): 결과 조회
- `cancel_goal` (Service): 목표 취소
- `status` (Topic): 상태 변화 알림
- `feedback` (Topic): 작업 진행 상황 보고

## 핵심 흐름
1. **목록**: `get_action_names_and_types`로 액션 목록을 가져옵니다.
2. **상태 관찰**: 액션의 `status` 토픽을 구독하여 Goal의 상태(`accepted`, `executing`, `succeeded` 등)를 추적합니다.
3. **결과**: `get_result` 서비스를 사용하여 결과(`succeeded` 또는 `aborted`)를 조회합니다.
4. **결과 조회 정책**: "관찰된 Goal만 조회"하여 시스템 부하를 방지합니다.

## Goal 상태 매핑표
| ROS2 상태 | 백엔드 값 | 프론트 표시 | 색상 | 의미 |
| :--- | :--- | :--- | :--- | :--- |
| accepted | accepted | 수락됨 | 노랑 | 목표가 수락됨 |
| executing | executing | 실행 중 | 파랑 | 작업 수행 중 |
| succeeded | succeeded | 성공 | 초록 | 작업 완료 |
| aborted | aborted | 실패 | 빨강 | 작업 실패 |

## Result 표시 매핑표
| 조건 | 프론트 표시 | 의미 | 정상/문제 여부 |
| :--- | :--- | :--- | :--- |
| last_goal_status = executing | 결과 대기 | 작업 완료 전 | 정상 |
| last_goal_status = succeeded | 성공 | 작업 완료 | 정상 |

---

### 내가 반드시 알아야 할 3줄 요약
1. 액션은 3개의 서비스와 2개의 토픽으로 구성된 복잡한 통신 방식입니다.
2. 대시보드는 액션의 `status` 토픽과 `get_result` 서비스를 통해 Goal 상태와 결과를 추적합니다.
3. Goal의 상태(실행 중, 성공, 실패 등)를 통해 작업의 정상 진행 여부를 한눈에 확인할 수 있습니다.
