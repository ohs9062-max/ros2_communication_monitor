import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyInterfaces,
  callRegisteredService,
  checkInterfaceImports,
  deleteInterfacePackage,
  fetchActionGoalHistory,
  fetchCallableActions,
  fetchCallableServices,
  fetchInterfaceApplyStatus,
  fetchInterfacePackages,
  fetchInterfaceRegistry,
  fetchServiceCallHistory,
  sendActionGoal,
  uploadInterface,
  uploadInterfacePackage,
  uploadInterfacePackageFolder,
} from '../api/rosApi.js'

const ACCEPTED_EXTENSIONS = ['.msg', '.srv', '.action']

export function InterfaceUploadControl({ onStateChanged, refreshSignal = 0, websocket }) {
  const inputRef = useRef(null)
  const packageFolderInputRef = useRef(null)
  const packageInputRef = useRef(null)
  const lastRefreshSignalRef = useRef(refreshSignal)
  const dragCleanupRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [reloadPhase, setReloadPhase] = useState('idle')
  const [feedback, setFeedback] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [applyStatus, setApplyStatus] = useState(null)
  const [showRegistry, setShowRegistry] = useState(false)
  const [showCallableServices, setShowCallableServices] = useState(false)
  const [showCallableActions, setShowCallableActions] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [showBuildLog, setShowBuildLog] = useState(false)
  const [buildLogTail, setBuildLogTail] = useState('')
  const [registryPanelPosition, setRegistryPanelPosition] = useState(null)
  const [buildLogPosition, setBuildLogPosition] = useState(null)
  const [servicePanelPosition, setServicePanelPosition] = useState(null)
  const [actionPanelPosition, setActionPanelPosition] = useState(null)
  const [callableServices, setCallableServices] = useState([])
  const [selectedServiceKey, setSelectedServiceKey] = useState('')
  const [requestValues, setRequestValues] = useState({})
  const [timeoutSec, setTimeoutSec] = useState(2)
  const [serviceCallBusy, setServiceCallBusy] = useState(false)
  const [serviceCallResult, setServiceCallResult] = useState(null)
  const [serviceCallHistory, setServiceCallHistory] = useState([])
  const [callableActions, setCallableActions] = useState([])
  const [selectedActionKey, setSelectedActionKey] = useState('')
  const [goalValues, setGoalValues] = useState({})
  const [goalTimeoutSec, setGoalTimeoutSec] = useState(10)
  const [actionGoalBusy, setActionGoalBusy] = useState(false)
  const [actionGoalResult, setActionGoalResult] = useState(null)
  const [actionGoalHistory, setActionGoalHistory] = useState([])
  const [replacePackage, setReplacePackage] = useState(false)
  const [packages, setPackages] = useState([])
  const [packagePanelPosition, setPackagePanelPosition] = useState(null)

  const chooseFile = () => inputRef.current?.click()
  const choosePackageFolder = () => packageFolderInputRef.current?.click()
  const choosePackageFile = () => packageInputRef.current?.click()
  const toggleBuildLog = () => {
    setShowBuildLog((value) => {
      const nextValue = !value
      if (nextValue && !buildLogPosition) {
        setBuildLogPosition(defaultFloatingPosition(540, 112))
      }
      return nextValue
    })
  }
  const disabled = busy || applying || serviceCallBusy || actionGoalBusy
  const selectedService = callableServices.find(
    (service) => serviceKey(service) === selectedServiceKey,
  )
  const selectedAction = callableActions.find(
    (action) => actionKey(action) === selectedActionKey,
  )

  const uploadFiles = async (files, sourceLabel) => {
    const supportedFiles = files.filter((file) =>
      ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension)),
    )
    if (!supportedFiles.length) {
      setFeedback({ tone: 'error', text: `${sourceLabel}에 .msg, .srv, .action 파일이 없습니다.` })
      return
    }

    setBusy(true)
    setFeedback(null)
    const succeeded = []
    const warned = []
    const failed = []
    try {
      for (const file of supportedFiles) {
        try {
          const payload = await uploadInterface(file)
          const item = payload.data
          if (payload.success && !item.parsed_error) succeeded.push(item.file_name)
          else warned.push(`${item.file_name}${item.parsed_error ? ` (${item.parsed_error})` : ''}`)
        } catch (error) {
          failed.push(`${file.name} (${error.message})`)
        }
      }

      const summary = [
        `${sourceLabel}: ${supportedFiles.length}개 처리`,
        `성공 ${succeeded.length}`,
        warned.length ? `경고 ${warned.length}` : null,
        failed.length ? `실패 ${failed.length}` : null,
      ].filter(Boolean).join(' · ')
      const details = failed[0] ?? warned[0]
      setFeedback({
        tone: failed.length ? 'error' : warned.length ? 'warning' : 'success',
        text: details ? `${summary} · ${details}` : `${summary} · ${succeeded.join(', ')}`,
      })
      if (showRegistry) await loadRegistry(true)
      await loadApplyStatus()
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: `${sourceLabel} 후 상태 갱신 실패: ${error.message}` })
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (event) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) await uploadFiles(files, '파일 업로드')
  }

  const handlePackageFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setFeedback({ tone: 'error', text: 'interface package는 .zip 파일만 가능합니다.' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const payload = await uploadInterfacePackage(file, { replace: replacePackage })
      const item = payload.data
      const counts = interfaceCounts(item.interfaces)
      setFeedback({
        tone: 'success',
        text: `${item.name} package 업로드 완료 · msg ${counts.msg}, srv ${counts.srv}, action ${counts.action} · 적용하기로 build/import를 진행하세요.`,
      })
      await loadPackages(true)
      await loadApplyStatus()
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const handlePackageFolder = async (event) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const packageFiles = files.filter((file) => {
      const relativePath = file.webkitRelativePath || file.name
      return /(^|\/)(package\.xml|CMakeLists\.txt)$/.test(relativePath)
        || /\/(msg|srv|action)\/[^/]+\.(msg|srv|action)$/.test(relativePath)
    })
    if (!packageFiles.length) {
      setFeedback({ tone: 'error', text: 'package.xml, CMakeLists.txt, msg/srv/action 파일이 있는 ROS2 package 폴더를 선택하세요.' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const payload = await uploadInterfacePackageFolder(packageFiles, { replace: replacePackage })
      const item = payload.data
      const counts = interfaceCounts(item.interfaces)
      setFeedback({
        tone: 'success',
        text: `${item.name} package 폴더 업로드 완료 · msg ${counts.msg}, srv ${counts.srv}, action ${counts.action} · 적용하기로 build/import를 진행하세요.`,
      })
      await loadPackages(true)
      await loadApplyStatus()
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadApplyStatus = useCallback(async () => {
    const payload = await fetchInterfaceApplyStatus()
    setApplyStatus(payload.data)
    setBuildLogTail(payload.data?.log_tail ?? '')
    return payload.data
  }, [])

  const loadRegistry = async (keepOpen = false) => {
    if (showRegistry && !keepOpen) {
      setShowRegistry(false)
      return
    }
    setBusy(true)
    try {
      const payload = await fetchInterfaceRegistry()
      setRegistry(payload.data)
      if (!registryPanelPosition) {
        setRegistryPanelPosition(defaultFloatingPosition(300, 112))
      }
      setShowRegistry(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadPackages = async (keepOpen = false) => {
    if (showPackages && !keepOpen) {
      setShowPackages(false)
      return
    }
    setBusy(true)
    try {
      const payload = await fetchInterfacePackages()
      setPackages(payload.data ?? [])
      if (!packagePanelPosition) {
        setPackagePanelPosition(defaultFloatingPosition(420, 132))
      }
      setShowPackages(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const removePackage = async (packageName) => {
    setBusy(true)
    try {
      await deleteInterfacePackage(packageName)
      setFeedback({
        tone: 'warning',
        text: `${packageName} package를 삭제했습니다. 적용하기로 build 상태를 갱신하세요.`,
      })
      await loadPackages(true)
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadCallableServices = async (keepOpen = false) => {
    if (showCallableServices && !keepOpen) {
      setShowCallableServices(false)
      return
    }
    setBusy(true)
    try {
      const [servicesPayload, historyPayload] = await Promise.all([
        fetchCallableServices(),
        fetchServiceCallHistory(),
      ])
      const services = servicesPayload.data ?? []
      setCallableServices(services)
      setServiceCallHistory(historyPayload.data ?? [])
      if (!servicePanelPosition) {
        setServicePanelPosition(defaultFloatingPosition(420, 112))
      }
      setShowCallableServices(true)
      const selectedStillExists = services.some(
        (service) => serviceKey(service) === selectedServiceKey,
      )
      const nextSelected = selectedStillExists
        ? selectedServiceKey
        : services[0] ? serviceKey(services[0]) : ''
      setSelectedServiceKey(nextSelected)
      const nextService = services.find(
        (service) => serviceKey(service) === nextSelected,
      )
      if (nextService) {
        setRequestValues(defaultRequestValues(nextService.request_schema))
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadCallableActions = async (keepOpen = false) => {
    if (showCallableActions && !keepOpen) {
      setShowCallableActions(false)
      return
    }
    setBusy(true)
    try {
      const [actionsPayload, historyPayload] = await Promise.all([
        fetchCallableActions(),
        fetchActionGoalHistory(),
      ])
      const actions = actionsPayload.data ?? []
      setCallableActions(actions)
      setActionGoalHistory(historyPayload.data ?? [])
      if (!actionPanelPosition) {
        setActionPanelPosition(defaultFloatingPosition(420, 156))
      }
      setShowCallableActions(true)
      const selectedStillExists = actions.some(
        (action) => actionKey(action) === selectedActionKey,
      )
      const nextSelected = selectedStillExists
        ? selectedActionKey
        : actions[0] ? actionKey(actions[0]) : ''
      setSelectedActionKey(nextSelected)
      const nextAction = actions.find(
        (action) => actionKey(action) === nextSelected,
      )
      if (nextAction) {
        setGoalValues(defaultRequestValues(nextAction.goal_schema))
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const runImportCheck = useCallback(async () => {
    try {
      const payload = await checkInterfaceImports()
      setRegistry(payload.data)
      setShowRegistry(true)
      const packagePayload = await fetchInterfacePackages()
      setPackages(packagePayload.data ?? [])
      setPackagePanelPosition((position) => position ?? defaultFloatingPosition(420, 132))
      setShowPackages(true)
      const summary = payload.summary ?? {}
      const notApplied = summary.not_applied ?? payload.not_applied ?? []
      if (payload.real_apply_success) {
        setFeedback({
          tone: 'success',
          text: '적용 완료. 새 interface 타입을 사용할 수 있습니다.',
        })
      } else {
        setFeedback({
          tone: 'warning',
          text: notApplied.length
            ? `부분 적용: 파일 생성 또는 CMake 등록이 완료되지 않았습니다. 상세 상태를 확인하세요. (${notApplied[0].file_name ?? 'registry'}: ${notApplied[0].reason})`
            : '부분 적용: import 재확인이 완료되지 않았습니다. 상세 상태를 확인하세요.',
        })
      }
      setReloadPhase('idle')
      await loadApplyStatus()
      onStateChanged?.()
    } catch (error) {
      setFeedback({
        tone: 'warning',
        text: `서버는 다시 연결됐지만 import 재확인에 실패했습니다: ${error.message}`,
      })
    }
  }, [loadApplyStatus, onStateChanged])

  const applyUploadedInterfaces = async () => {
    setApplying(true)
    setBuildLogTail('')
    setShowBuildLog(false)
    setFeedback({ tone: 'warning', text: '빌드 중...' })
    try {
      const payload = await applyInterfaces()
      const status = payload.data ?? {}
      setApplyStatus(status)
      setBuildLogTail(status.log_tail ?? '')
      if (payload.real_apply_success) {
        setReloadPhase('scheduled')
        setFeedback({
          tone: 'success',
          text: '적용 완료. 새 interface 타입을 사용할 수 있습니다.',
        })
      } else {
        const notApplied = payload.not_applied ?? status.not_applied ?? []
        setReloadPhase('idle')
        const importFailed = payload.status === 'import_failed'
        setFeedback({
          tone: payload.status === 'partial' || importFailed ? 'warning' : 'error',
          text: importFailed
            ? '빌드는 성공했지만 현재 backend 프로세스에서 import 확인에 실패했습니다.'
            : notApplied.length
            ? `부분 적용: 파일 생성 또는 CMake 등록이 완료되지 않았습니다. 상세 상태를 확인하세요. (${notApplied[0].file_name ?? 'registry'}: ${notApplied[0].reason})`
            : payload.message || '빌드 실패. CMakeLists.txt, package.xml, interface 의존성을 확인하세요.',
        })
      }
      await loadApplyStatus()
      await loadRegistry(true)
      await loadPackages(true)
      onStateChanged?.()
    } catch (error) {
      setReloadPhase('idle')
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setApplying(false)
    }
  }

  const executeServiceCall = async () => {
    if (!selectedService || !selectedService.callable) {
      setServiceCallResult({ success: false, error: '호출 가능한 Service가 없습니다.' })
      return
    }
    setServiceCallBusy(true)
    setServiceCallResult(null)
    try {
      const payload = await callRegisteredService({
        service_name: selectedService.service_name,
        service_type: selectedService.service_type,
        request: requestValues,
        timeout_sec: timeoutSec,
      })
      setServiceCallResult(payload)
      const historyPayload = await fetchServiceCallHistory()
      setServiceCallHistory(historyPayload.data ?? [])
      onStateChanged?.()
    } catch (error) {
      setServiceCallResult({ success: false, error: error.message })
    } finally {
      setServiceCallBusy(false)
    }
  }

  const executeActionGoal = async () => {
    if (!selectedAction || !selectedAction.callable) {
      setActionGoalResult({ success: false, error: '실행 가능한 Action이 없습니다.' })
      return
    }
    setActionGoalBusy(true)
    setActionGoalResult(null)
    try {
      const payload = await sendActionGoal({
        action_name: selectedAction.action_name,
        action_type: selectedAction.action_type,
        goal: goalValues,
        timeout_sec: goalTimeoutSec,
      })
      setActionGoalResult(payload)
      const historyPayload = await fetchActionGoalHistory()
      setActionGoalHistory(historyPayload.data ?? [])
      onStateChanged?.()
    } catch (error) {
      setActionGoalResult({ success: false, accepted: false, error: error.message })
    } finally {
      setActionGoalBusy(false)
    }
  }

  useEffect(() => {
    loadApplyStatus().catch((error) => {
      setFeedback({ tone: 'warning', text: `적용 상태를 읽을 수 없습니다: ${error.message}` })
    })
  }, [loadApplyStatus])

  useEffect(() => () => {
    dragCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (lastRefreshSignalRef.current === refreshSignal) return
    lastRefreshSignalRef.current = refreshSignal

    const refreshOpenState = async () => {
      try {
        const statusPayload = await fetchInterfaceApplyStatus()
        setApplyStatus(statusPayload.data)
        setBuildLogTail(statusPayload.data?.log_tail ?? '')
        if (showRegistry) {
          const registryPayload = await fetchInterfaceRegistry()
          setRegistry(registryPayload.data)
          setShowRegistry(true)
        }
        if (showPackages) {
          const packagesPayload = await fetchInterfacePackages()
          setPackages(packagesPayload.data ?? [])
          setShowPackages(true)
        }
        if (showCallableServices) {
          const [servicesPayload, historyPayload] = await Promise.all([
            fetchCallableServices(),
            fetchServiceCallHistory(),
          ])
          const services = servicesPayload.data ?? []
          setCallableServices(services)
          setServiceCallHistory(historyPayload.data ?? [])
          setShowCallableServices(true)
          const selectedStillExists = services.some(
            (service) => serviceKey(service) === selectedServiceKey,
          )
          const nextSelected = selectedStillExists
            ? selectedServiceKey
            : services[0] ? serviceKey(services[0]) : ''
          setSelectedServiceKey(nextSelected)
          const nextService = services.find(
            (service) => serviceKey(service) === nextSelected,
          )
          if (nextService) {
            setRequestValues(defaultRequestValues(nextService.request_schema))
          }
        }
        if (showCallableActions) {
          const [actionsPayload, historyPayload] = await Promise.all([
            fetchCallableActions(),
            fetchActionGoalHistory(),
          ])
          const actions = actionsPayload.data ?? []
          setCallableActions(actions)
          setActionGoalHistory(historyPayload.data ?? [])
          setShowCallableActions(true)
          const selectedStillExists = actions.some(
            (action) => actionKey(action) === selectedActionKey,
          )
          const nextSelected = selectedStillExists
            ? selectedActionKey
            : actions[0] ? actionKey(actions[0]) : ''
          setSelectedActionKey(nextSelected)
          const nextAction = actions.find(
            (action) => actionKey(action) === nextSelected,
          )
          if (nextAction) {
            setGoalValues(defaultRequestValues(nextAction.goal_schema))
          }
        }
      } catch (error) {
        setFeedback({ tone: 'warning', text: `상태 새로고침에 실패했습니다: ${error.message}` })
      }
    }

    refreshOpenState()
  }, [
    refreshSignal,
    selectedActionKey,
    selectedServiceKey,
    showCallableActions,
    showCallableServices,
    showPackages,
    showRegistry,
  ])

  useEffect(() => {
    if (reloadPhase === 'scheduled' && websocket?.status !== 'connected') {
      setReloadPhase('reconnecting')
    }
    if (reloadPhase === 'reconnecting' && websocket?.status === 'connected') {
      runImportCheck()
    }
  }, [reloadPhase, runImportCheck, websocket?.status])

  useEffect(() => {
    if (reloadPhase !== 'scheduled') return undefined
    const timer = window.setTimeout(() => {
      runImportCheck()
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [reloadPhase, runImportCheck])

  return (
    <div className="interface-upload-control">
      <input
        accept=".msg,.srv,.action"
        className="interface-file-input"
        onChange={handleFile}
        ref={inputRef}
        type="file"
      />
      <input
        accept=".zip"
        className="interface-file-input"
        onChange={handlePackageFile}
        ref={packageInputRef}
        type="file"
      />
      <input
        className="interface-file-input"
        directory=""
        multiple
        onChange={handlePackageFolder}
        ref={packageFolderInputRef}
        type="file"
        webkitdirectory=""
      />
      <button className="interface-upload-button" disabled={disabled} onClick={chooseFile} type="button">
        {busy ? '처리 중…' : '타입 업로드'}
      </button>
      <button className="interface-package-button" disabled={disabled} onClick={choosePackageFile} type="button">
        Package zip 업로드
      </button>
      <button className="interface-package-folder-button" disabled={disabled} onClick={choosePackageFolder} type="button">
        Package 폴더 업로드
      </button>
      <label className="interface-package-replace">
        <input
          checked={replacePackage}
          disabled={disabled}
          onChange={(event) => setReplacePackage(event.target.checked)}
          type="checkbox"
        />
        <span>replace</span>
      </label>
      <button className="interface-apply-button" disabled={disabled} onClick={applyUploadedInterfaces} type="button">
        {applying ? '빌드 중…' : '적용하기'}
      </button>
      <button className="interface-registry-button" disabled={disabled} onClick={() => loadRegistry()} type="button">
        등록 목록
      </button>
      <button className="interface-package-list-button" disabled={disabled} onClick={() => loadPackages()} type="button">
        Package 목록
      </button>
      <button className="interface-service-button" disabled={disabled} onClick={() => loadCallableServices()} type="button">
        Service 실행
      </button>
      <button className="interface-action-button" disabled={disabled} onClick={() => loadCallableActions()} type="button">
        Action 실행
      </button>
      {reloadPhase !== 'idle' && (
        <span className="interface-reload-state" role="status">
          {websocket?.status === 'connected' ? 'reload 대기' : '서버 재연결 중'}
        </span>
      )}
      {feedback && (
        <span className={`interface-upload-feedback ${feedback.tone}`} role="status">
          {feedback.text}
        </span>
      )}
      {buildLogTail && applyStatus?.build_status === 'failed' && (
        <>
          <button
            className="interface-error-toggle"
            onClick={toggleBuildLog}
            type="button"
          >
            {showBuildLog ? '상세 오류 숨기기' : '상세 오류 보기'}
          </button>
          {showBuildLog && (
            <div
              className="interface-build-log-panel"
              style={floatingPanelStyle(buildLogPosition)}
            >
              <div
                className="interface-floating-heading"
                onPointerDown={(event) => startFloatingDrag({
                  cleanupRef: dragCleanupRef,
                  event,
                  height: 260,
                  position: buildLogPosition,
                  setPosition: setBuildLogPosition,
                  width: 540,
                })}
              >
                <strong>상세 오류</strong>
                <button aria-label="상세 오류 닫기" onClick={() => setShowBuildLog(false)} type="button">×</button>
              </div>
              <pre className="interface-build-log">{buildLogTail}</pre>
            </div>
          )}
        </>
      )}
      {showRegistry && (
        <div
          className="interface-registry-panel"
          style={floatingPanelStyle(registryPanelPosition)}
        >
          <div
            className="interface-registry-heading interface-floating-heading"
            onPointerDown={(event) => startFloatingDrag({
              cleanupRef: dragCleanupRef,
              event,
              height: 380,
              position: registryPanelPosition,
              setPosition: setRegistryPanelPosition,
              width: 300,
            })}
          >
            <strong>등록된 타입</strong>
            <button aria-label="등록 목록 닫기" onClick={() => setShowRegistry(false)} type="button">×</button>
          </div>
          <RegistryGroup items={registry?.messages} label="Message" />
          <RegistryGroup items={registry?.services} label="Service" />
          <RegistryGroup items={registry?.actions} label="Action" />
        </div>
      )}
      {showPackages && (
        <div
          className="interface-package-panel"
          style={floatingPanelStyle(packagePanelPosition)}
        >
          <div
            className="interface-registry-heading interface-floating-heading"
            onPointerDown={(event) => startFloatingDrag({
              cleanupRef: dragCleanupRef,
              event,
              height: 520,
              position: packagePanelPosition,
              setPosition: setPackagePanelPosition,
              width: 420,
            })}
          >
            <strong>Uploaded Interface Packages</strong>
            <button aria-label="Package 목록 닫기" onClick={() => setShowPackages(false)} type="button">×</button>
          </div>
          <p className="interface-package-help">
            장비가 실제 사용하는 원본 interface package를 패키지명 그대로 등록합니다.
          </p>
          <PackageRegistry packages={packages} onDelete={removePackage} />
        </div>
      )}
      {showCallableServices && (
        <div
          className="interface-service-panel"
          style={floatingPanelStyle(servicePanelPosition)}
        >
          <div
            className="interface-registry-heading interface-floating-heading"
            onPointerDown={(event) => startFloatingDrag({
              cleanupRef: dragCleanupRef,
              event,
              height: 520,
              position: servicePanelPosition,
              setPosition: setServicePanelPosition,
              width: 420,
            })}
          >
            <strong>등록 Service 실행</strong>
            <button aria-label="Service 실행 닫기" onClick={() => setShowCallableServices(false)} type="button">×</button>
          </div>
          {callableServices.length ? (
            <>
              <label className="interface-service-field">
                <span>Service</span>
                <select
                  onChange={(event) => {
                    const key = event.target.value
                    const service = callableServices.find((item) => serviceKey(item) === key)
                    setSelectedServiceKey(key)
                    setRequestValues(defaultRequestValues(service?.request_schema ?? []))
                    setServiceCallResult(null)
                  }}
                  value={selectedServiceKey}
                >
                  {callableServices.map((service) => (
                    <option key={serviceKey(service)} value={serviceKey(service)}>
                      {serviceStatusLabel(service)} · {service.service_name || service.file_name} · {service.service_type}
                    </option>
                  ))}
                </select>
              </label>
              {selectedService && (
                <div className={`interface-service-state ${selectedService.callable ? 'success' : 'warning'}`}>
                  {serviceStatusLabel(selectedService)}
                  {selectedService.reason ? ` · ${selectedService.reason}` : ''}
                </div>
              )}
              {selectedService?.request_schema?.map((field) => (
                <RequestField
                  field={field}
                  key={field.name ?? field.raw_line}
                  disabled={!selectedService?.callable}
                  onChange={(value) => setRequestValues((current) => ({
                    ...current,
                    [field.name]: value,
                  }))}
                  value={requestValues[field.name]}
                />
              ))}
              <label className="interface-service-field">
                <span>timeout_sec</span>
                <input
                  min="0.1"
                  disabled={!selectedService?.callable}
                  onChange={(event) => setTimeoutSec(Number(event.target.value))}
                  step="0.1"
                  type="number"
                  value={timeoutSec}
                />
              </label>
              <button
                className="interface-service-call-button"
                disabled={serviceCallBusy || !selectedService?.callable}
                onClick={executeServiceCall}
                type="button"
              >
                {serviceCallBusy ? '실행 중…' : '실행'}
              </button>
              {serviceCallResult && (
                <CallResultBlock
                  result={serviceCallResult}
                  successPayload={serviceCallResult.response}
                />
              )}
              <ServiceCallHistory calls={serviceCallHistory} />
            </>
          ) : (
            <small>registry에 등록된 Service가 없습니다.</small>
          )}
        </div>
      )}
      {showCallableActions && (
        <div
          className="interface-service-panel"
          style={floatingPanelStyle(actionPanelPosition)}
        >
          <div
            className="interface-registry-heading interface-floating-heading"
            onPointerDown={(event) => startFloatingDrag({
              cleanupRef: dragCleanupRef,
              event,
              height: 520,
              position: actionPanelPosition,
              setPosition: setActionPanelPosition,
              width: 420,
            })}
          >
            <strong>등록 Action 실행</strong>
            <button aria-label="Action 실행 닫기" onClick={() => setShowCallableActions(false)} type="button">×</button>
          </div>
          {callableActions.length ? (
            <>
              <label className="interface-service-field">
                <span>Action</span>
                <select
                  onChange={(event) => {
                    const key = event.target.value
                    const action = callableActions.find((item) => actionKey(item) === key)
                    setSelectedActionKey(key)
                    setGoalValues(defaultRequestValues(action?.goal_schema ?? []))
                    setActionGoalResult(null)
                  }}
                  value={selectedActionKey}
                >
                  {callableActions.map((action) => (
                    <option key={actionKey(action)} value={actionKey(action)}>
                      {actionStatusLabel(action)} · {action.action_name || action.file_name} · {action.action_type}
                    </option>
                  ))}
                </select>
              </label>
              {selectedAction && (
                <div className={`interface-service-state ${selectedAction.callable ? 'success' : 'warning'}`}>
                  {actionStatusLabel(selectedAction)}
                  {selectedAction.reason ? ` · ${selectedAction.reason}` : ''}
                </div>
              )}
              {selectedAction?.goal_schema?.map((field) => (
                <RequestField
                  disabled={!selectedAction?.callable}
                  field={field}
                  key={field.name ?? field.raw_line}
                  onChange={(value) => setGoalValues((current) => ({
                    ...current,
                    [field.name]: value,
                  }))}
                  value={goalValues[field.name]}
                />
              ))}
              <label className="interface-service-field">
                <span>timeout_sec</span>
                <input
                  disabled={!selectedAction?.callable}
                  min="0.1"
                  onChange={(event) => setGoalTimeoutSec(Number(event.target.value))}
                  step="0.1"
                  type="number"
                  value={goalTimeoutSec}
                />
              </label>
              <button
                className="interface-service-call-button"
                disabled={actionGoalBusy || !selectedAction?.callable}
                onClick={executeActionGoal}
                type="button"
              >
                {actionGoalBusy ? '요청 전송 중…' : 'Goal 실행'}
              </button>
              {actionGoalResult && (
                <ActionGoalResult result={actionGoalResult} />
              )}
              <ActionGoalHistory goals={actionGoalHistory} />
            </>
          ) : (
            <small>registry에 등록된 Action이 없습니다.</small>
          )}
        </div>
      )}
    </div>
  )
}

function startFloatingDrag({ cleanupRef, event, height, position, setPosition, width }) {
  if (event.button !== 0 || event.target.closest('button')) return
  event.preventDefault()
  cleanupRef?.current?.()

  const current = position ?? defaultFloatingPosition(width, event.clientY)
  const offsetX = event.clientX - current.left
  const offsetY = event.clientY - current.top

  const handleMove = (moveEvent) => {
    setPosition(clampFloatingPosition({
      left: moveEvent.clientX - offsetX,
      top: moveEvent.clientY - offsetY,
    }, width, height))
  }
  const handleUp = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    if (cleanupRef) {
      cleanupRef.current = null
    }
  }

  setPosition(current)
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp, { once: true })
  if (cleanupRef) {
    cleanupRef.current = handleUp
  }
}

function floatingPanelStyle(position) {
  if (!position) return undefined
  return {
    left: `${position.left}px`,
    top: `${position.top}px`,
  }
}

function defaultFloatingPosition(width, top = 112) {
  if (typeof window === 'undefined') {
    return { left: 24, top }
  }
  return clampFloatingPosition({
    left: window.innerWidth - width - 24,
    top,
  }, width, 180)
}

function clampFloatingPosition(position, width, height) {
  if (typeof window === 'undefined') return position
  const margin = 8
  const maxLeft = Math.max(margin, window.innerWidth - width - margin)
  const maxTop = Math.max(margin, window.innerHeight - height - margin)
  return {
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop),
  }
}

function PackageRegistry({ onDelete, packages }) {
  if (!packages.length) {
    return <small>업로드된 interface package가 없습니다.</small>
  }
  return (
    <div className="interface-package-list">
      {packages.map((item) => (
        <details className="interface-package-card" key={item.name} open>
          <summary>
            <span>
              <strong>{item.name}</strong>
              <small>{packageStatusLabel(item)}</small>
            </span>
            <button
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete(item.name)
              }}
              type="button"
            >
              삭제
            </button>
          </summary>
          <dl>
            <dt>path</dt>
            <dd>{item.path}</dd>
            <dt>source</dt>
            <dd>{item.source}</dd>
            <dt>uploaded_at</dt>
            <dd>{item.uploaded_at}</dd>
          </dl>
          <InterfaceTypeList items={item.interfaces?.msg} label="msg" />
          <InterfaceTypeList items={item.interfaces?.srv} label="srv" />
          <InterfaceTypeList items={item.interfaces?.action} label="action" />
          {item.import_error && <p className="interface-package-error">{item.import_error}</p>}
        </details>
      ))}
    </div>
  )
}

function InterfaceTypeList({ items = [], label }) {
  return (
    <div className="interface-package-types">
      <span>{label} {items.length}</span>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.type}>
              <code>{item.type}</code>
              <small>{item.import_available ? 'import 가능' : item.import_error || 'import 대기'}</small>
              <InterfaceSchema item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function InterfaceSchema({ item }) {
  const parsed = item.parsed ?? {}
  const sections = [
    ['fields', parsed.fields],
    ['request', parsed.request],
    ['response', parsed.response],
    ['goal', parsed.goal],
    ['result', parsed.result],
    ['feedback', parsed.feedback],
  ].filter(([, fields]) => Array.isArray(fields) && fields.length)

  if (!sections.length) {
    return item.parsed_error ? <small>{item.parsed_error}</small> : null
  }

  return (
    <div className="interface-package-schema">
      {sections.map(([section, fields]) => (
        <div key={section}>
          <small>{section}</small>
          {fields.map((field) => (
            <code key={`${section}-${field.name}-${field.type}`}>
              {field.type} {field.name}
            </code>
          ))}
        </div>
      ))}
    </div>
  )
}

function interfaceCounts(interfaces = {}) {
  return {
    msg: interfaces.msg?.length ?? 0,
    srv: interfaces.srv?.length ?? 0,
    action: interfaces.action?.length ?? 0,
  }
}

function packageStatusLabel(item) {
  if (item.import_available) return 'import available'
  if (item.last_build_status === 'failed') return 'build failed'
  if (item.last_build_status === 'success') return 'import pending'
  return item.rebuild_required ? 'build required' : 'uploaded'
}

function ActionGoalResult({ result }) {
  return (
    <div className="interface-action-result">
      <span className={result.accepted ? 'success' : 'error'}>
        {result.accepted ? 'accepted' : 'rejected/failed'}
      </span>
      {Array.isArray(result.feedback) && result.feedback.length > 0 && (
        <div className="interface-action-feedback">
          <span>feedback</span>
          <ul>
            {result.feedback.map((item, index) => (
              <li key={`${index}-${JSON.stringify(item)}`}>
                <code>{JSON.stringify(item)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      <CallResultBlock result={result} successPayload={result.result} />
    </div>
  )
}

function CallResultBlock({ result, successPayload }) {
  const validationError = result.error_type === 'validation_error'
  return (
    <>
      {validationError && (
        <div className="interface-validation-warning">
          입력값이 서비스/액션 타입과 맞지 않아 호출하지 않았습니다. 서버에는 요청을 보내지 않았습니다.
        </div>
      )}
      <pre className={`interface-service-result ${result.success ? 'success' : 'error'}`}>
        {JSON.stringify(result.success ? successPayload : result, null, 2)}
      </pre>
    </>
  )
}

function RequestField({ disabled = false, field, onChange, value }) {
  if (!field.name) {
    return null
  }
  const type = field.type ?? ''
  if (type === 'bool' || type === 'boolean') {
    return (
      <label className="interface-service-field inline">
        <input
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>{field.name}</span>
      </label>
    )
  }
  if (isComplexType(type)) {
    return (
      <label className="interface-service-field">
        <span>{field.name} <small>{type} · JSON</small></span>
        <textarea
          disabled={disabled}
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value || 'null'))
            } catch {
              onChange(event.target.value)
            }
          }}
          rows={type.includes('[') || type.startsWith('sequence<') ? 4 : 3}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? defaultFieldValue(type), null, 2)}
        />
      </label>
    )
  }
  const numeric = isNumericType(type)
  return (
    <label className="interface-service-field">
      <span>{field.name} <small>{type}</small></span>
      <input
        disabled={disabled}
        onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
        type={numeric ? 'number' : 'text'}
        value={value ?? ''}
      />
    </label>
  )
}

function ServiceCallHistory({ calls }) {
  if (!calls.length) {
    return null
  }
  return (
    <div className="interface-service-history">
      <span>최근 실행</span>
      <ul>
        {calls.slice(0, 3).map((call) => (
          <li key={`${call.called_at}-${call.service_name}`}>
            {call.service_name} · {call.success ? '성공' : '실패'} · {Math.round(call.elapsed_ms ?? 0)}ms
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActionGoalHistory({ goals }) {
  if (!goals.length) {
    return null
  }
  return (
    <div className="interface-service-history">
      <span>최근 Goal</span>
      <ul>
        {goals.slice(0, 3).map((goal) => (
          <li key={`${goal.sent_at}-${goal.action_name}`}>
            {goal.action_name} · {goal.accepted ? 'accepted' : 'rejected'} · {Math.round(goal.elapsed_ms ?? 0)}ms
          </li>
        ))}
      </ul>
    </div>
  )
}

function serviceKey(service) {
  return `${service.service_name || service.file_name}|${service.service_type}`
}

function actionKey(action) {
  return `${action.action_name || action.file_name}|${action.action_type}`
}

function serviceStatusLabel(service) {
  if (service.callable) return '호출 가능'
  if (!service.import_available) return 'import 불가'
  if (!service.server_available) return '서버 없음'
  return '호출 불가'
}

function actionStatusLabel(action) {
  if (action.callable) return '호출 가능'
  if (!action.import_available) return 'import 불가'
  if (!action.server_available) return '서버 없음'
  return '호출 불가'
}

function defaultRequestValues(schema = []) {
  return Object.fromEntries(
    schema
      .filter((field) => field.name)
      .map((field) => [field.name, defaultFieldValue(field.type)]),
  )
}

function defaultFieldValue(type = '') {
  if (type === 'bool' || type === 'boolean') return false
  if (isArrayType(type)) return []
  if (isCustomType(type)) return {}
  if (isNumericType(type)) return 0
  return ''
}

function isNumericType(type = '') {
  return /^(?:u?int(?:8|16|32|64)|float(?:32|64)|double)$/.test(type)
}

function isArrayType(type = '') {
  return /\[[0-9]*\]$/.test(type) || /^sequence<.+>$/.test(type)
}

function isCustomType(type = '') {
  return /^[A-Za-z][A-Za-z0-9_]*\/(?:msg\/)?[A-Z][A-Za-z0-9_]*$/.test(type)
}

function isComplexType(type = '') {
  return isArrayType(type) || isCustomType(type)
}

function RegistryGroup({ items = [], label }) {
  return (
    <div className="interface-registry-group">
      <span>{label} ({items.length})</span>
      {items.length ? (
        <ul>{items.map((item) => (
          <li key={item.file_name}>
            {item.file_name}
            <small>
              {item.build?.file_saved ? '파일 생성됨' : '파일 미생성'} · {' '}
              {item.build?.cmake_registered ? 'CMake 등록됨' : 'CMake 미등록'} · {' '}
              {item.build?.package_xml_checked ? 'package.xml 확인됨' : 'package.xml 미확인'} · {' '}
              {item.build?.rebuild_required ? '재빌드 필요' : '빌드 반영'} · {' '}
              {item.build?.import_available ? 'import 가능' : 'import 불가'}
              {item.build?.saved_path ? ` · ${item.build.saved_path}` : ''}
              {item.build?.error ? ` · 오류: ${item.build.error}` : ''}
            </small>
          </li>
        ))}</ul>
      ) : <small>등록 없음</small>}
    </div>
  )
}
