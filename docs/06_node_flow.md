# Node Monitoring 흐름

## 무엇을 하는가

Node Runtime은 현재 Node 목록만 보여주는 것이 아니라 각 Node가 어떤 Topic, Service, Action에 참여하는지 관계를 조립한다. 이 관계가 주요 Node 판정과 Visualization 연결선의 근거가 된다.

## 관계 수집

```text
get_node_names()
→ Node별 Publisher / Subscriber 조회
→ Service Server / Client 조회
→ Action Server / Client 조회
→ 통신 이름과 full_type을 관계 배열로 저장
```

`/ros/nodes`의 주요 관계 필드는 다음과 같다.

- `topic_publishers`
- `topic_subscribers`
- `service_servers`
- `service_clients`
- `action_servers`
- `action_clients`

관계에는 가능한 경우 이름과 타입을 함께 보존한다. 이름만 같다고 등록 Interface 사용 Node로 판정하지 않기 위해서다.

## 주요 Node 판정

Frontend의 `nodeFilters.js`는 Node 관계 타입을 주요 Topic, Service, Action의 타입과 exact match한다.

```text
주요 Topic을 publish 또는 subscribe
또는 주요 Service의 Server 또는 Client
또는 주요 Action의 Server 또는 Client
→ 주요 Node
```

등록 Interface가 있다는 사실만으로 모든 Node를 포함하지 않는다. 실제 관계가 있어야 한다. 기존 기본 주요 Node 규칙과 dashboard monitor 내부 Node, 숨김·내부 항목 제외 정책도 유지된다.

## 발견 상태 기억

Node가 현재 Graph에서 사라져도 즉시 모든 정보를 버리지 않는다.

- 현재 발견: `graph_present=true`, `ever_discovered=true`, `last_seen_at` 갱신
- 이전 발견 후 사라짐: `graph_present=false`, `disconnected_at` 설정, 상태 `disconnected`
- 한 번도 발견되지 않음: 종료 오류로 만들지 않음

사라진 Node의 현재 연결 수는 0으로 보되, 어떤 통신에 참여했던 Node인지 설명할 수 있도록 마지막 관계 snapshot을 유지한다. Backend 재시작 시 이 메모리 정보는 초기화된다.

Graph만으로 종료 사유를 확인할 수 없으므로 화면과 Alert는 “비정상 종료” 대신 “Node 연결 끊김” 또는 “종료 감지”를 사용한다.

## 상태와 Alert

현재 Graph에 있는 Node는 정상 또는 중립 상태다. 이전에 본 Node가 사라지면 빨간 `disconnected` 상태가 되고 Node Alert가 생성된다.

코드 호환성을 위해 Alert code가 `node_stale`로 유지돼 있지만, 실제 판정과 사용자 의미는 시간 지연 stale이 아니라 Graph에서 사라진 Node의 연결 끊김이다.

## 담당 파일

- `node/runtime.py`: Graph 관계와 cache
- `node/alerts.py`: disconnected Node Alert
- `node/models.py`: 상태와 Alert code
- `resource_state.py`: 공통 발견 이력
- `frontend/src/utils/nodeFilters.js`: 주요 Node exact match

## 문제가 생기면

1. `/ros/nodes`에서 관계 배열에 타입이 있는지 확인
2. 주요 Topic/Service/Action API의 타입과 비교
3. 내부 dashboard Node가 제외되는지 확인
4. 사라진 Node의 `ever_discovered`, `last_seen_at`, `disconnected_at` 확인
5. 화면 문제면 Nodes, Overview, Visualization이 같은 필터를 사용하는지 확인
