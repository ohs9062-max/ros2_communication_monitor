# 핵심 개념

## 1. ROS2 통신 요소

**Node**는 센서 읽기나 로봇 제어처럼 하나의 역할을 수행하는 ROS2 프로그램
단위입니다. 이 프로젝트는 Node 이름뿐 아니라 각 Node가 연결한 Topic, Service,
Action 관계도 수집합니다. Backend 구현은 `node/runtime.py` L69-L147,
Frontend 표시는 `NodesPage.jsx` L16-L163입니다.

**Topic**은 데이터를 계속 발행하고 구독하는 통신 채널입니다. `TopicRuntime`은
Graph에서 Topic을 찾고 지원 type을 구독하여 최근 메시지와 Hz를 기록합니다.
Backend 구현은 `topic/runtime.py` L101-L158, L296-L440이고 화면은
`TopicsPage.jsx` L13-L181입니다.

**Service**는 client가 한 번 요청하고 server가 응답하는 통신입니다. 기본 감시는
server/client 존재 여부를 확인하며, 실제 요청은 allowlist 대상만 수행합니다.
Backend 구현은 `service/runtime.py` L86-L134이고 화면은 `ServicesPage.jsx` L73-L231입니다.

**Action**은 오래 걸리는 작업을 Goal, Feedback, Result로 나눈 통신입니다. 이
대시보드는 Goal이나 cancel을 보내지 않고 status/feedback을 관찰합니다. 관찰한 종료
Goal만 result를 조회합니다. 구현은 `action/runtime.py` L84-L137, L258-L433과
`action/result_runtime.py` L82-L223입니다.

## 2. 상태를 수집하는 구조

ROS2의 현재 이름과 연결 관계를 코드로 조회하는 기능이 **Graph API**입니다.
Runtime은 Graph API를 사용해 목록을 조사합니다. Topic 메시지 본문은 Graph API가
아니라 **subscription(구독)**으로 받습니다.

메시지 도착처럼 나중에 사건이 생겼을 때 자동 호출할 함수를 **callback(콜백)**이라고
합니다. Topic callback은 preview와 timestamp를 저장하고 Action callback은 Goal
상태와 feedback을 저장합니다.

```text
timer가 Runtime.update() 호출
  — ros_monitor.py L66-L70, L304-L309

→ Runtime이 Graph API로 통신 구조 조사
  — topic/runtime.py L101-L147 등 각 runtime.py

→ 필요한 Topic subscription 생성
  — topic/runtime.py L296-L323, action/runtime.py L325-L397

→ 메시지 도착 시 callback 실행
  — topic/runtime.py L385-L401, action/runtime.py L403-L433

→ cache 저장 후 snapshot으로 API 전달
  — 각 runtime.py의 snapshot(), main.py L54-L127
```

## 3. Runtime, cache, snapshot

**Runtime**은 서버가 실행되는 동안 특정 영역의 상태와 기능을 묶어 관리하는
객체입니다. `TopicRuntime`은 Topic 목록·구독·latest·Hz를, 다른 Runtime도 각자
Service, Action, Node 상태를 맡습니다. 생성 위치는 `ros_monitor.py` L32-L57입니다.

**cache**는 Runtime이 메모리에 보관하는 최신 결과이고, **snapshot**은 API가 안전하게
읽도록 cache를 복사한 한 시점의 값입니다. `snapshot()`은 Graph를 새로 조회하는
함수가 아닙니다. 예를 들어 Topic snapshot은 `topic/runtime.py` L70-L80에서 만듭니다.

**coordinator(조정자)**인 `RosMonitor`는 세부 로직을 직접 반복하지 않고 Runtime의
`update()`와 `snapshot()`을 호출합니다. 전체 조립은 `ros_monitor.py` L23-L57,
갱신 순서는 L304-L309입니다.

## 4. 동시에 실행되는 작업

**thread(스레드)**는 하나의 프로그램 안에서 별도로 진행되는 작업 흐름입니다.
FastAPI는 웹 요청을 처리하고 ROS2 spin thread는 timer와 subscription callback을
처리합니다. 생성 위치는 `ros_monitor.py` L72-L73, 실제 spin은 L292-L302입니다.

두 실행 흐름이 같은 cache에 접근하므로 **Lock(락)**이 갱신 중인 데이터를 다른
쪽에서 읽지 못하게 잠시 보호합니다. cache 구조는 수집과 API 제공을 분리하기 위한
설계이고, Lock은 그 cache를 안전하게 공유하기 위한 도구입니다.

## 5. 함수 전달과 비동기 결과

`node_getter`는 Runtime이 현재 ROS2 Node를 가져오는 함수입니다.
`node_getter=lambda: self._node`의 **lambda**는 짧은 이름 없는 함수이며, 호출 시점의
Node를 반환합니다. 전달 위치는 `ros_monitor.py` L32-L57입니다.

Service `call_async()`는 응답을 기다리지 않고 **Future**, 즉 나중에 완료될 결과
객체를 반환합니다. `async def`가 없어도 이 요청은 비동기로 진행됩니다. 시작은
`active_check_runtime.py` L147-L214, 완료·timeout 처리는 L76-L145입니다.

## 6. 세 가지 반복 주기

**polling(폴링)**은 일정 간격마다 다시 확인하는 방식입니다.

- Backend `poll_interval_sec`: Graph를 다시 조사해 cache 갱신
  (`ros_monitor.py` L66-L70)
- Frontend 1·3·5초: REST snapshot 다시 요청
  (`useTopicDashboard.js` L14-L17, 각 도메인 hook, `useVisualizationGraph.js` L17-L46)
- WebSocket 1초: 경량 snapshot 전송 (`main.py` L15, L130-L147)

세 주기는 서로 독립적입니다.

## 7. 전체 흐름 한 문장

timer와 subscription callback이 Runtime cache를 갱신하고 Lock이 이를 보호하면
FastAPI가 snapshot을 REST와 WebSocket으로 전달합니다.

## 초보자가 자주 틀리는 부분

- Graph API는 메시지 본문이 아니라 이름과 연결 관계를 알려줍니다.
- class는 설계도이고 `TopicRuntime(...)`으로 만든 값이 실제 실행 객체입니다.
- stale은 Graph에서 사라진 흔적이지 운영체제 process 종료를 확정한 값이 아닙니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Node, Topic, Service, Action은 서로 다른 통신 역할을 가집니다.
2. Runtime cache와 snapshot이 ROS2 수집과 웹 API 사이를 연결합니다.
3. thread, callback, Future, Lock은 동시에 진행되는 수집 결과를 안전하게 관리합니다.
