# Alert 통합 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

Topic, MonitorStatus, Service, Action, Node Alert의 생성과 통합,
`/ros/alerts`, Overview/Alerts 화면 반영을 설명한다.

상태 badge는 관찰 상태를 넓게 보여주지만 Alert는 조치 가능성이 높은 조건만
builder가 선별한다.

## 2. 전체 흐름

```text
각 Runtime cache
→ RosMonitor.alerts
→ 도메인별 builder
→ 하나의 alerts 배열 + meta
→ /ros/alerts
→ Overview / Alerts / 도메인 화면
```

## 3. 통합 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | Runtime Alert 입력 수집 | `backend/.../ros_monitor.py` | L156-L163 | `RosMonitor.alerts` |
| 2 | Topic/MonitorStatus builder 호출 | 같은 파일 | L165-L170 | `RosMonitor.alerts` |
| 3 | Service builder 병합 | 같은 파일 | L171-L176 | `RosMonitor.alerts` |
| 4 | Action builder 병합 | 같은 파일 | L177-L182 | `RosMonitor.alerts` |
| 5 | Node builder 병합 | 같은 파일 | L183-L188 | `RosMonitor.alerts` |
| 6 | 배열과 공통 meta 반환 | 같은 파일 | L190-L195 | `RosMonitor.alerts` |
| 7 | REST endpoint | `backend/.../main.py` | L124-L127 | `get_ros_alerts` |

## 4. 도메인별 Alert 정책

| 도메인 | 조건 | 코드 위치 |
|---|---|---|
| Topic | required stream의 publisher 없음, 장기 미수신, stale | `topic/alerts.py` L24-L34, L83-L178 |
| MonitorStatus | preview level이 warning/error/critical | `topic/alerts.py` L181-L237 |
| Service | user/visible/allowlist active check의 timeout/error/failed | `service/alerts.py` L18-L88 |
| Action | aborted, canceled, result lookup error | `action/alerts.py` L18-L63 |
| Node | stale | `node/alerts.py` L14-L41 |

Topic required stream은 `/imu`, `/joint_states`, `/odom`, `/scan`이다.
command Topic `/cmd_vel`, `/cmd_vel_smoothed`는 기본 Topic Alert에서 제외된다.

## 5. Alert와 badge 차이

| 상태 정보 | 목록 badge | 기본 Alert |
|---|---|---|
| 일반 Topic 구독자 없음 | 표시 | 제외 |
| 일반 Topic 발행자 대기/미지원 | 표시 | 제외 |
| command Topic 미수신 | 표시 가능 | 제외 |
| Service 상태만 표시/waiting server | 표시 | 제외 |
| Action Goal 미관찰/waiting server | 표시 | 제외 |
| required stream 장기 미수신/stale | 표시 | 포함 |
| Service active check timeout/failed/error | 표시 | 포함 |
| Action aborted/canceled/result error | 표시 | 포함 |
| Node stale | 표시 | 포함 |

badge는 `status`와 runtime 정보를 해석하는 화면 표현이고, Alert는 위 builder가
만든 별도 배열이다. 따라서 badge 개수와 Alert count는 같지 않아도 정상이다.

## 6. Frontend 반영

| 화면 | 코드 위치 | 처리 |
|---|---|---|
| 공통 polling | `frontend/src/hooks/useTopicDashboard.js` L17-L148 | `/ros/alerts`를 Topic dashboard에 보관 |
| Overview | `frontend/src/pages/OverviewPage.jsx` L20-L37, L91-L104 | meta/count/preview와 클릭 이동 |
| Overview 목록 | `frontend/src/components/AlertsPreview.jsx` L1-L48 | 최근 Alert 표시 |
| Alerts | `frontend/src/pages/AlertsPage.jsx` L3-L60 | source별 대상 화면/선택 state 설정 |
| 전체 목록 | `frontend/src/components/AlertsList.jsx` L1-L65 | Alert row 렌더링 |
| 도메인별 | 각 `use*Dashboard` hook | source로 해당 Alert만 filter |

`OverviewPage`의 전체 상태는 `utils/status.js`의 `overallStatus`가 Alert meta를
사용한다. Alert 클릭은 Topic/Service는 직접 관련 화면으로, 그 밖은 Alerts 또는
source별 화면으로 이동한다.

## 7. 발표 때 설명할 문장

“화면의 상태 badge는 관찰 정보를 넓게 보여주고, Alert는 사용자가 조치할
가능성이 높은 조건만 별도 정책으로 선별합니다.”

## 8. 헷갈리기 쉬운 부분

- MonitorStatus Alert source는 `monitor_status`이며 일반 Topic source와 다르다.
- `detected_at`은 Alert snapshot을 만든 시각이지 최초 장애 발생 시각이 아니다.
- Node stale은 짧게 보존되는 cache에 의존하므로 영구 이벤트 이력이 아니다.
- 현재 Alert 저장 DB는 없고 현재 snapshot만 반환한다.

## 9. 관련 파일 빠른 참조

`ros_monitor.py`, `topic/alerts.py`, `service/alerts.py`,
`action/alerts.py`, `node/alerts.py`, `main.py`,
`OverviewPage.jsx`, `AlertsPage.jsx`, `AlertsList.jsx`
