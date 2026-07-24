# Interface Lab 흐름

## 무엇을 하는가

Interface Lab은 ROS Interface를 등록하고 import 가능한 상태로 만든 뒤, 사용자가 직접 Topic Publish/Receive, Service Call, Action Goal을 실행하는 도구다.

자동 Monitoring은 관찰 경로이고 Interface Lab은 명시 실행 경로다. 등록 타입을 공유하지만 Runtime 책임은 분리된다.

## 등록 방식

| 방식 | 의미 | 저장/Build |
|---|---|---|
| `manual_type` | 이미 설치돼 import 가능한 타입 이름 등록 | 파일 생성 없음, 보통 build 불필요 |
| `manual_definition` | 화면에서 `.msg/.srv/.action` 정의 작성 | `uploaded_interfaces`에 저장, build 필요 |
| `single_upload` | Interface 파일 하나 업로드 | `uploaded_interfaces`에 저장, build 필요 |
| `package_upload` | 완성된 Interface package 업로드 | package 단위 보존, build 필요 |

개별 등록은 `interface_registry.yaml`, package 등록은 `interface_packages.yaml`에 기록된다.

## 두 종류의 업로드 저장소

### uploaded_interfaces

직접 작성과 단일 업로드 파일을 한 ROS package에 모은다.

`manual_interfaces.py`가 현재 남은 파일을 다시 스캔하고 `CMakeLists.txt`와 `package.xml` 전체를 재생성한다. append 방식이 아니므로 삭제된 파일이 metadata에 남지 않는다.

파일이 0개면 `rosidl_generate_interfaces()`를 남기지 않고 build 가능한 빈 `ament_cmake` package로 만든다.

### uploaded_interface_packages

zip 또는 folder로 올린 완성 package를 package 이름 그대로 보존한다. 업로드 과정은 `package.xml`과 `CMakeLists.txt`의 존재와 package/project 이름을 검증한 뒤 원본 폴더를 복사한다.

Backend가 업로드 package의 XML과 CMake를 새 스크립트로 재작성하지 않는다. 자동 재생성 정책은 공유 `uploaded_interfaces` package에만 적용된다.

## Apply와 import 확인

```text
등록 또는 파일 변경
→ pending/build_required 기록
→ 사용자가 Apply
→ backend workspace에서 colcon build --symlink-install
→ build log와 status 저장
→ generated Python import check
→ registry/package의 import_available 갱신
→ reload_trigger.py 갱신
```

동시 Apply는 lock으로 막는다. Backend 프로세스를 직접 kill하지 않으며, Uvicorn이 `--reload`로 실행 중이면 trigger 변경을 감지해 worker를 재시작할 수 있다.

## 등록 타입이 Monitoring에 연결되는 방식

Apply 뒤 `import_available=true`가 된 타입은 다음 경로에 연결된다.

| kind | Monitoring/화면 | Interface Lab |
|---|---|---|
| msg | Graph exact match 시 주요 Topic, 자동 상세 감시, Alert | Publish/Receive 후보 |
| srv | Graph exact match 시 주요 Service | callable Service 후보 |
| action | Graph exact match 시 주요 Action | callable Action 후보 |

Node는 위 통신에 실제 참여할 때만 주요 Node가 된다. Frontend가 YAML을 직접 읽지 않고 Backend 결과를 사용한다.

## Topic Publish

```text
등록된 import 가능 msg 선택
→ schema 생성
→ Topic 이름과 payload 입력
→ Graph 이름/type 안전 검사
→ ROS message 변환
→ Publisher 생성 또는 재사용
→ publish와 history 기록
```

Graph 후보는 선택 msg `full_type`과 exact match한 Topic만 보여준다. Action 내부 Topic은 일반 Publish 후보와 실행 대상에서 제외한다.

후보가 정확히 하나이고 입력이 비어 있을 때만 자동 입력할 수 있다. 사용자가 직접 입력한 유효한 이름은 polling이나 후보 재계산으로 덮어쓰지 않는다. Graph에 없는 새 이름도 명시 Publish할 수 있지만, 같은 이름에 다른 타입이 이미 있으면 Backend가 전송 전에 거부한다.

## Topic Receive

Receive는 자동 Topic Monitoring Subscription과 다르다.

```text
사용자가 Topic/type 선택
→ start
→ InterfaceReceiveRuntime Subscription
→ 수신 history 저장
→ stop 또는 reset
```

사용자가 시작한 Topic만 이 history에 들어간다. Monitoring의 latest/Hz cache와 목적을 섞지 않는다.

## Service Call

등록 srv 타입과 Graph의 Service 타입이 exact match하고 Server가 있을 때 callable 후보가 된다.

공통 converter가 scalar, sequence, nested custom msg, custom msg array를 재귀 변환한다. validation 실패 시 `sent_to_server=false`로 기록하고 요청을 전송하지 않는다. 성공/응답/timeout/error는 call history에 저장한다.

등록됐다는 이유만으로 자동 호출하지 않는다.

## Action Goal

등록 action 타입과 Graph Action 타입이 exact match하고 Server가 있을 때 callable 후보가 된다.

사용자가 실행하면 Goal schema validation 후 ActionClient가 Goal을 보낸다. accepted/rejected, timeout, feedback, result와 오류를 history로 저장한다. 같은 이름이라도 type이 다르면 다른 Action으로 취급한다.

Monitoring의 status/result 관찰이 새 Goal을 보내는 것은 아니다.

## 삭제

개별 Interface 삭제는 source, kind, `full_type`, file name이 맞는 항목만 제거한다. `uploaded_interfaces`의 파일을 지운 뒤 package metadata를 다시 생성하고 build pending을 남긴다.

package 삭제는 `interface_packages.yaml`과 해당 `uploaded_interface_packages/<package>`만 대상으로 한다. 두 저장소의 삭제 생명주기를 섞지 않는다.

## 담당 파일

- `interface_lab/management/registry.py`
- `interface_lab/management/manual_interfaces.py`
- `interface_lab/management/packages.py`
- `interface_lab/apply/runtime.py`
- `interface_lab/execution/topic_runtime.py`
- `interface_lab/execution/service_call_runtime.py`
- `interface_lab/execution/action_goal_runtime.py`
- `interface_lab/common/value_converter.py`
- `frontend/src/pages/InterfaceLabPage.jsx`
- `frontend/src/components/InterfaceUploadControl.jsx`

## 문제가 생기면

1. registry/package entry의 source, kind, `full_type`, `import_available` 확인
2. Apply status와 `interface_apply_last.log` 확인
3. Backend가 새 overlay를 source한 환경에서 실행됐는지 확인
4. Graph 타입과 등록 타입 exact match 확인
5. validation 실패면 `sent_to_*`와 `error_type` 확인
6. reload 뒤 문제면 Monitoring Runtime 재시작과 WebSocket 재연결을 별도로 확인
