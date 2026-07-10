# Service 모니터링 흐름

Service 모니터링은 노드 간의 동기식(요청-응답) 통신 상태를 확인합니다.

## 핵심 흐름
1. **목록 가져오기**: `_update_services` (`ros_monitor.py`)에서 `self._node.get_service_names_and_types()`를 사용합니다.
2. **Active Check (중요)**: 모든 서비스를 호출하면 부하가 크기 때문에, `monitor.yaml`의 **allowlist(허용 목록)**에 등록된 안전한 read-only 서비스만 직접 호출(`active_check`)하여 응답 시간과 성공 여부를 확인합니다.
3. **분류**: 서비스 명칭을 기준으로 `user`, `parameter`, `action_internal`, `ros_internal` 등으로 분류합니다.

## 안전 설계 (중요!)
Service 호출 결과와 응답 시간은 **모든 서비스가 아니라**, `monitor.yaml` allowlist에 등록된 안전한 read-only 서비스만 측정합니다. 시스템 부하를 방지하기 위함입니다.

## 주요 API 필드 (`/ros/services`)
- `name`: 서비스 이름
- `server_count`: 서비스 서버 수
- `client_count`: 서비스 클라이언트 수
- `active_check_supported`: 액티브 체크 기능 지원 여부
- `response_time_ms`: 응답 시간 (allowlist 서비스만 해당)
- `status`: 상태 (`ok`, `failed` 등)

## 프론트 연결
- **Hook**: `frontend/src/hooks/useServiceDashboard.js`
- **Page**: `frontend/src/pages/ServicesPage.jsx`
- **Table**: `frontend/src/components/ServiceTable.jsx`

---

### 내가 반드시 알아야 할 3줄 요약
1. 백엔드는 서비스 목록을 주기적으로 조회하며, 부하를 줄이기 위해 allowlist에 등록된 서비스만 `active_check` 합니다.
2. `active_check`는 실제 서비스를 호출하여 응답 시간과 성공/실패를 측정합니다.
3. 프론트는 이 정보를 바탕으로 서비스의 정상 동작 여부를 표시합니다.
