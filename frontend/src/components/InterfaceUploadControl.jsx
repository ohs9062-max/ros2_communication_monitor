import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  graphPublishTopicCandidates,
  topicHasType,
  topicNameTypeWarning,
} from '../utils/interfaceTopics.js'
import {
  applyInterfaces,
  callRegisteredService,
  deleteInterfaceRegistryEntry,
  checkInterfaceImports,
  deleteManualDefinition,
  deleteInterfacePackage,
  fetchActionGoalHistory,
  fetchCallableActions,
  fetchCallableMessages,
  fetchCallableServices,
  fetchInterfaceApplyStatus,
  fetchInterfacePackages,
  fetchInterfaceRegistry,
  fetchReceiveActionHistory,
  fetchReceiveServiceHistory,
  fetchReceiveTopicHistory,
  fetchReceiveTopics,
  fetchServiceCallHistory,
  fetchTopicPublishHistory,
  fetchTopics,
  publishTopicMessage,
  registerManualType,
  rebuildUploadedInterfacesCmake,
  resetReceiveActionHistory,
  resetReceiveServiceHistory,
  resetReceiveTopicHistory,
  resetTopicPublishHistory,
  sendActionGoal,
  startReceiveTopic,
  stopReceiveTopic,
  uploadInterface,
  uploadInterfacePackage,
  uploadInterfacePackageFolder,
  updateManualDefinition,
  validateManualDefinition,
  writeManualDefinition,
} from '../api/rosApi.js'

const ACCEPTED_EXTENSIONS = ['.msg', '.srv', '.action']

export function InterfaceUploadControl({
  onStateChanged,
  onTopicWorkspaceExpandedChange,
  refreshSignal = 0,
  websocket,
}) {
  const inputRef = useRef(null)
  const packageFolderInputRef = useRef(null)
  const packageInputRef = useRef(null)
  const lastRefreshSignalRef = useRef(refreshSignal)
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [reloadPhase, setReloadPhase] = useState('idle')
  const [feedback, setFeedback] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [recentDeletedRegistry, setRecentDeletedRegistry] = useState([])
  const [applyStatus, setApplyStatus] = useState(null)
  const [showRegistry, setShowRegistry] = useState(false)
  const [showCallableTopics, setShowCallableTopics] = useState(false)
  const [showCallableServices, setShowCallableServices] = useState(false)
  const [showCallableActions, setShowCallableActions] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [showBuildLog, setShowBuildLog] = useState(false)
  const [buildLogTail, setBuildLogTail] = useState('')
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
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualMode, setManualMode] = useState('type')
  const [manualType, setManualType] = useState('rths_interfaces/srv/ScheduleCrud')
  const [manualDescription, setManualDescription] = useState('')
  const manualPackage = 'uploaded_interfaces'
  const [manualKind, setManualKind] = useState('srv')
  const [manualTypeName, setManualTypeName] = useState('MyControl')
  const [manualDefinition, setManualDefinition] = useState('uint8 cmd\n---\nbool success\nstring message\n')
  const [editingManualDefinition, setEditingManualDefinition] = useState(null)
  const [showReceivePanel, setShowReceivePanel] = useState(false)
  const [receiveMode, setReceiveMode] = useState('topic')
  const [availableTopics, setAvailableTopics] = useState([])
  const [receiveTopics, setReceiveTopics] = useState([])
  const [selectedReceiveTopic, setSelectedReceiveTopic] = useState('')
  const selectedReceiveTopicSourceRef = useRef('empty')
  const [receiveTopicSearch, setReceiveTopicSearch] = useState('')
  const [callableMessages, setCallableMessages] = useState([])
  const [topicImportableOnly, setTopicImportableOnly] = useState(false)
  const [selectedMessageKey, setSelectedMessageKey] = useState('')
  const [topicPublishName, setTopicPublishName] = useState('')
  const topicPublishNameSourceRef = useRef('empty')
  const [topicMessageValues, setTopicMessageValues] = useState({})
  const [topicPublishBusy, setTopicPublishBusy] = useState(false)
  const [topicPublishResult, setTopicPublishResult] = useState(null)
  const [topicPublishHistory, setTopicPublishHistory] = useState([])
  const [selectedReceiveServiceKey, setSelectedReceiveServiceKey] = useState('')
  const [activeReceiveServiceKey, setActiveReceiveServiceKey] = useState('')
  const [receiveServiceSearch, setReceiveServiceSearch] = useState('')
  const [serviceImportableOnly, setServiceImportableOnly] = useState(false)
  const [selectedReceiveActionKey, setSelectedReceiveActionKey] = useState('')
  const [activeReceiveActionKey, setActiveReceiveActionKey] = useState('')
  const [receiveActionSearch, setReceiveActionSearch] = useState('')
  const [actionImportableOnly, setActionImportableOnly] = useState(false)
  const [receiveTopicHistory, setReceiveTopicHistory] = useState([])
  const [receiveServiceHistory, setReceiveServiceHistory] = useState([])
  const [receiveActionHistory, setReceiveActionHistory] = useState([])
  const [topicWorkspaceExpanded, setTopicWorkspaceExpanded] = useState(false)

  const chooseFile = () => inputRef.current?.click()
  const choosePackageFolder = () => packageFolderInputRef.current?.click()
  const choosePackageFile = () => packageInputRef.current?.click()
  const toggleBuildLog = () => {
    setShowBuildLog((value) => !value)
    setShowRegistry(false)
    setShowPackages(false)
    setShowCallableTopics(false)
    setShowCallableServices(false)
    setShowCallableActions(false)
  }
  const disabled = busy || applying || serviceCallBusy || actionGoalBusy || topicPublishBusy
  const topicExpandedActive = topicWorkspaceExpanded
    && (
      showPackages
      || (
        showReceivePanel
        && (
          (showCallableTopics && receiveMode === 'topic')
          || (showCallableServices && receiveMode === 'service')
          || (showCallableActions && receiveMode === 'action')
          || (!showCallableTopics && !showCallableServices && !showCallableActions && receiveMode !== 'mock')
        )
      )
    )
  const selectedService = callableServices.find(
    (service) => serviceKey(service) === selectedServiceKey,
  )
  const selectedAction = callableActions.find(
    (action) => actionKey(action) === selectedActionKey,
  )
  const selectedMessage = callableMessages.find(
    (message) => messageKey(message) === selectedMessageKey,
  )
  const publishGraphTopics = useMemo(
    () => graphPublishTopicCandidates(availableTopics, selectedMessage?.message_type),
    [availableTopics, selectedMessage?.message_type],
  )
  const topicPublishWarning = topicNameTypeWarning(
    availableTopics,
    topicPublishName,
    selectedMessage?.message_type,
  )
  const visibleCallableMessages = topicImportableOnly
    ? callableMessages.filter((message) => message.import_available)
    : callableMessages
  const visibleCallableServices = serviceImportableOnly
    ? callableServices.filter((service) => service.import_available)
    : callableServices
  const visibleCallableActions = actionImportableOnly
    ? callableActions.filter((action) => action.import_available)
    : callableActions
  const filteredReceiveTopics = useMemo(() => {
    const keyword = receiveTopicSearch.trim().toLowerCase()
    const selectedType = selectedMessage?.message_type
    return availableTopics.filter((topic) => {
      const topicType = topic.type ?? topic.types?.[0] ?? ''
      if (selectedType && !topicHasType(topic, selectedType)) return false
      if (!keyword) return true
      return `${topic.name} ${topicType}`.toLowerCase().includes(keyword)
    })
  }, [availableTopics, receiveTopicSearch, selectedMessage?.message_type])
  const selectedTopicReceiving = receiveTopics.some((topic) =>
    topic.topic_name === selectedReceiveTopic
      && (!selectedMessage?.message_type || topic.topic_type === selectedMessage.message_type)
      && topic.receiving !== false,
  )
  const visibleReceiveTopicHistory = receiveTopicHistory.filter((event) =>
    (!selectedReceiveTopic || event.topic_name === selectedReceiveTopic)
      && (!selectedMessage?.message_type || event.topic_type === selectedMessage.message_type),
  )
  const visiblePublishHistory = topicPublishHistory.filter((event) =>
    (!topicPublishName || event.topic_name === topicPublishName)
      && (!selectedMessage?.message_type || event.topic_type === selectedMessage.message_type),
  )

  useEffect(() => {
    if (!selectedMessage?.message_type) return
    const currentName = topicPublishName.trim()
    const currentIsCandidate = publishGraphTopics.some((topic) => topic.name === currentName)
    const source = topicPublishNameSourceRef.current

    if (source === 'user') {
      if (currentName) return
    } else if (source === 'graph') {
      if (currentIsCandidate) return
      topicPublishNameSourceRef.current = 'empty'
      setTopicPublishName('')
      return
    } else if (source === 'auto' && publishGraphTopics.length !== 1) {
      topicPublishNameSourceRef.current = 'empty'
      setTopicPublishName('')
      return
    }

    if (publishGraphTopics.length === 1) {
      topicPublishNameSourceRef.current = 'auto'
      setTopicPublishName(publishGraphTopics[0].name)
    }
  }, [publishGraphTopics, selectedMessage?.message_type, topicPublishName])

  useEffect(() => {
    if (!selectedMessage?.message_type) return
    const currentIsCandidate = filteredReceiveTopics.some(
      (topic) => topic.name === selectedReceiveTopic,
    )
    const source = selectedReceiveTopicSourceRef.current
    if (source === 'user' && selectedReceiveTopic.trim()) return
    if ((source === 'auto' || source === 'graph') && currentIsCandidate) return

    const nextTopicName = filteredReceiveTopics[0]?.name ?? ''
    selectedReceiveTopicSourceRef.current = nextTopicName ? 'auto' : 'empty'
    setSelectedReceiveTopic(nextTopicName)
  }, [filteredReceiveTopics, selectedMessage?.message_type, selectedReceiveTopic])
  const filteredReceiveServices = callableServices.filter((service) => {
    const keyword = receiveServiceSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${service.service_name ?? service.file_name ?? ''} ${service.service_type ?? ''}`.toLowerCase().includes(keyword)
  })
  const filteredReceiveActions = callableActions.filter((action) => {
    const keyword = receiveActionSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${action.action_name ?? action.file_name ?? ''} ${action.action_type ?? ''}`.toLowerCase().includes(keyword)
  })
  const selectedReceiveService = callableServices.find(
    (service) => serviceKey(service) === selectedReceiveServiceKey,
  )
  const selectedReceiveAction = callableActions.find(
    (action) => actionKey(action) === selectedReceiveActionKey,
  )
  const visibleReceiveServiceHistory = selectedReceiveService && activeReceiveServiceKey === selectedReceiveServiceKey
    ? receiveServiceHistory.filter((event) =>
      event.service_name === selectedReceiveService.service_name
        && event.service_type === selectedReceiveService.service_type)
    : []
  const visibleReceiveActionHistory = selectedReceiveAction && activeReceiveActionKey === selectedReceiveActionKey
    ? receiveActionHistory.filter((event) =>
      event.action_name === selectedReceiveAction.action_name
        && event.action_type === selectedReceiveAction.action_type)
    : []

  useEffect(() => {
    if (!visibleCallableMessages.length) {
      if (selectedMessageKey) setSelectedMessageKey('')
      return
    }
    if (visibleCallableMessages.some((message) => messageKey(message) === selectedMessageKey)) {
      return
    }
    const nextMessage = visibleCallableMessages[0]
    setSelectedMessageKey(messageKey(nextMessage))
    setTopicMessageValues(defaultRequestValues(nextMessage.message_schema ?? []))
    setTopicPublishResult(null)
  }, [selectedMessageKey, visibleCallableMessages])

  useEffect(() => {
    if (!visibleCallableServices.length) {
      if (selectedServiceKey) {
        setSelectedServiceKey('')
        setSelectedReceiveServiceKey('')
      }
      return
    }
    if (visibleCallableServices.some((service) => serviceKey(service) === selectedServiceKey)) {
      return
    }
    const nextService = visibleCallableServices[0]
    const nextKey = serviceKey(nextService)
    setSelectedServiceKey(nextKey)
    setSelectedReceiveServiceKey(nextKey)
    setRequestValues(defaultRequestValues(nextService.request_schema ?? []))
    setServiceCallResult(null)
  }, [selectedServiceKey, visibleCallableServices])

  useEffect(() => {
    if (!visibleCallableActions.length) {
      if (selectedActionKey) {
        setSelectedActionKey('')
        setSelectedReceiveActionKey('')
      }
      return
    }
    if (visibleCallableActions.some((action) => actionKey(action) === selectedActionKey)) {
      return
    }
    const nextAction = visibleCallableActions[0]
    const nextKey = actionKey(nextAction)
    setSelectedActionKey(nextKey)
    setSelectedReceiveActionKey(nextKey)
    setGoalValues(defaultRequestValues(nextAction.goal_schema ?? []))
    setActionGoalResult(null)
  }, [selectedActionKey, visibleCallableActions])

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
      const refreshResults = await Promise.allSettled([
        fetchInterfaceRegistry(),
        fetchInterfaceApplyStatus(),
      ])
      if (refreshResults[0].status === 'fulfilled') {
        setRegistry(refreshResults[0].value.data)
      }
      if (refreshResults[1].status === 'fulfilled') {
        setApplyStatus(refreshResults[1].value.data)
        setBuildLogTail(refreshResults[1].value.data?.log_tail ?? '')
      }
      const refreshFailure = refreshResults.find((result) => result.status === 'rejected')
      if (refreshFailure && succeeded.length) {
        setFeedback({
          tone: 'warning',
          text: `${summary} · 등록은 완료됐지만 일부 상태 갱신에 실패했습니다. 상태 새로고침을 눌러 다시 확인하세요. · ${refreshFailure.reason.message}`,
        })
      }
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: `${sourceLabel} 처리 중 오류가 발생했습니다. · ${error.message}` })
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

  const submitManualType = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      const payload = await registerManualType({
        full_type: manualType,
        allowlisted: true,
        description: manualDescription,
      })
      const entry = payload.data ?? payload.entry
      setFeedback({
        tone: entry?.build?.import_available ? 'success' : 'warning',
        text: entry?.build?.import_available
          ? `${entry.full_type} 타입 직접 등록 완료 · import됨`
          : `${entry?.full_type ?? manualType} 타입 직접 등록 완료 · import 안됨: ${entry?.build?.import_error ?? '환경/source 확인 필요'}`,
      })
      await loadRegistry(true)
      onStateChanged?.()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const submitManualDefinition = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      const payload = editingManualDefinition
        ? await updateManualDefinition({
          kind: editingManualDefinition.kind,
          typeName: editingManualDefinition.typeName,
          definition: manualDefinition,
        })
        : await writeManualDefinition({
          package: manualPackage,
          kind: manualKind,
          type_name: manualTypeName,
          definition: manualDefinition,
        })
      const entry = payload.data ?? payload.entry
      setFeedback({
        tone: 'success',
        text: `${entry.full_type} 직접 작성 ${editingManualDefinition ? '수정' : '저장'} 완료 · 적용하기로 build/import를 진행하세요.`,
      })
      setEditingManualDefinition(null)
      await loadRegistry(true)
      await loadApplyStatus()
      onStateChanged?.()
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: `문법 오류가 있어 파일을 생성/수정하지 않았습니다. CMakeLists.txt도 수정하지 않았습니다. · ${error.message}`,
      })
    } finally {
      setBusy(false)
    }
  }

  const validateCurrentManualDefinition = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      await validateManualDefinition({
        package: manualPackage,
        kind: manualKind,
        type_name: manualTypeName,
        definition: manualDefinition,
      })
      setFeedback({ tone: 'success', text: '문법 검증 통과 · 아직 파일/CMake/registry는 수정하지 않았습니다.' })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: `문법 오류가 있어 파일을 생성하지 않았습니다. CMakeLists.txt도 수정하지 않았습니다. · ${error.message}`,
      })
    } finally {
      setBusy(false)
    }
  }

  const startEditManualDefinition = (item) => {
    setShowManualInput(true)
    setManualMode('definition')
    setManualKind(item.file_kind)
    setManualTypeName(item.type_name)
    setManualDefinition(item.raw_text ?? '')
    setEditingManualDefinition({ kind: item.file_kind, typeName: item.type_name })
  }

  const removeManualDefinition = async (item) => {
    setBusy(true)
    setFeedback(null)
    try {
      await deleteManualDefinition({ kind: item.file_kind, typeName: item.type_name })
      setFeedback({
        tone: 'warning',
        text: `${item.full_type ?? item.file_name} 파일 삭제 및 CMakeLists.txt 재생성 완료 · 적용하기로 build 상태를 다시 반영하세요.`,
      })
      if (editingManualDefinition?.kind === item.file_kind && editingManualDefinition?.typeName === item.type_name) {
        setEditingManualDefinition(null)
      }
      await refreshInterfaceListsAfterDelete()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const regenerateUploadedInterfacesCmake = async () => {
    setBusy(true)
    try {
      const payload = await rebuildUploadedInterfacesCmake()
      setFeedback({
        tone: 'success',
        text: `CMakeLists.txt 재생성 완료 · ${payload.data?.interfaces?.length ?? 0}개 interface 반영 · 적용하기를 다시 실행하세요.`,
      })
      await loadApplyStatus()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadReceiveState = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBusy(true)
    try {
      const [
        topicsPayload,
        receivingPayload,
        topicHistoryPayload,
        servicePayload,
        actionPayload,
        messagesPayload,
        publishHistoryPayload,
        callableServicesPayload,
        callableActionsPayload,
      ] = await Promise.all([
        fetchTopics(),
        fetchReceiveTopics(),
        fetchReceiveTopicHistory('', { limit: 500 }),
        fetchReceiveServiceHistory(),
        fetchReceiveActionHistory(),
        fetchCallableMessages(),
        fetchTopicPublishHistory({ limit: 100 }),
        fetchCallableServices(),
        fetchCallableActions(),
      ])
      const topics = topicsPayload.data?.topics ?? topicsPayload.data ?? []
      const services = callableServicesPayload.data ?? []
      const actions = callableActionsPayload.data ?? []
      const messages = messagesPayload.data ?? []
      setAvailableTopics(topics)
      setReceiveTopics(receivingPayload.data ?? [])
      setReceiveTopicHistory(topicHistoryPayload.data ?? [])
      setReceiveServiceHistory(servicePayload.data ?? [])
      setReceiveActionHistory(actionPayload.data ?? [])
      setCallableMessages(messages)
      setTopicPublishHistory(publishHistoryPayload.data ?? [])
      setCallableServices(services)
      setCallableActions(actions)
      if (!selectedMessageKey && messages[0]) {
        const nextKey = messageKey(messages[0])
        setSelectedMessageKey(nextKey)
        setTopicMessageValues(defaultRequestValues(messages[0].message_schema ?? []))
      }
      if (!selectedReceiveServiceKey && services[0]) {
        setSelectedReceiveServiceKey(serviceKey(services[0]))
      }
      if (!selectedReceiveActionKey && actions[0]) {
        setSelectedReceiveActionKey(actionKey(actions[0]))
      }
    } catch (error) {
      if (!silent) setFeedback({ tone: 'error', text: error.message })
    } finally {
      if (!silent) setBusy(false)
    }
  }, [selectedMessageKey, selectedReceiveActionKey, selectedReceiveServiceKey])

  const startSelectedTopicReceive = async () => {
    if (!selectedReceiveTopic.trim()) {
      setFeedback({ tone: 'error', text: '수신할 Topic 이름을 입력하세요.' })
      return
    }
    const topicType = selectedMessage?.message_type
    if (!topicType) {
      setFeedback({ tone: 'error', text: '수신할 Message full_type을 선택하세요.' })
      return
    }
    try {
      await startReceiveTopic({
        topic_name: selectedReceiveTopic.trim(),
        topic_type: topicType,
        history_limit: 500,
      })
      await loadReceiveState()
      setFeedback({ tone: 'success', text: `${selectedReceiveTopic.trim()} · ${topicType} 수신을 시작했습니다.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const stopSelectedTopicReceive = async () => {
    try {
      await stopReceiveTopic({
        topic_name: selectedReceiveTopic,
        topic_type: selectedMessage?.message_type,
      })
      await loadReceiveState()
      setFeedback({ tone: 'warning', text: `${selectedReceiveTopic} 수신을 중지했습니다.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const resetSelectedTopicReceiveHistory = async () => {
    if (!selectedReceiveTopic) {
      setFeedback({ tone: 'error', text: '리셋할 Topic을 선택하세요.' })
      return
    }
    try {
      const payload = await resetReceiveTopicHistory(selectedReceiveTopic, selectedMessage?.message_type)
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `${selectedReceiveTopic} 수신 이력 ${payload.data?.cleared ?? 0}개를 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const publishSelectedTopicMessage = async () => {
    if (!topicPublishName.trim()) {
      setTopicPublishResult({ success: false, error: 'Publish할 Topic 이름을 입력하세요.' })
      return
    }
    if (!selectedMessage?.message_type) {
      setTopicPublishResult({ success: false, error: 'Publish할 Message full_type을 선택하세요.' })
      return
    }
    setTopicPublishBusy(true)
    setTopicPublishResult(null)
    try {
      const payload = await publishTopicMessage({
        topic_name: topicPublishName.trim(),
        topic_type: selectedMessage.message_type,
        full_type: selectedMessage.message_type,
        message: normalizeNumericValues(topicMessageValues, selectedMessage.message_schema),
      })
      setTopicPublishResult(payload)
      const historyPayload = await fetchTopicPublishHistory({ limit: 100 })
      setTopicPublishHistory(historyPayload.data ?? [])
      onStateChanged?.()
    } catch (error) {
      setTopicPublishResult({ success: false, error: error.message })
    } finally {
      setTopicPublishBusy(false)
    }
  }

  const resetSelectedTopicPublishHistory = async () => {
    try {
      const payload = await resetTopicPublishHistory({
        topic_name: topicPublishName,
        topic_type: selectedMessage?.message_type,
      })
      const historyPayload = await fetchTopicPublishHistory({ limit: 100 })
      setTopicPublishHistory(historyPayload.data ?? [])
      setFeedback({
        tone: 'success',
        text: `Topic Publish 이력 ${payload.data?.cleared ?? 0}개를 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const resetAllTopicReceiveHistory = async () => {
    try {
      const payload = await resetReceiveTopicHistory()
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `Topic 수신 이력 ${payload.data?.cleared ?? 0}개를 전체 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const startSelectedServiceReceive = async () => {
    if (!selectedReceiveService) {
      setFeedback({ tone: 'error', text: '수신할 Service를 선택하세요.' })
      return
    }
    try {
      await resetReceiveServiceHistory({
        service_name: selectedReceiveService.service_name,
        service_type: selectedReceiveService.service_type,
      })
      setActiveReceiveServiceKey(selectedReceiveServiceKey)
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `${selectedReceiveService.service_name} Service 수신 관찰을 시작했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const stopSelectedServiceReceive = async () => {
    if (!activeReceiveServiceKey) {
      setFeedback({ tone: 'warning', text: '수신 중인 Service 관찰 항목이 없습니다.' })
      return
    }
    setActiveReceiveServiceKey('')
    setFeedback({ tone: 'warning', text: 'Service 수신 관찰을 중지했습니다.' })
  }

  const resetServiceReceiveHistory = async () => {
    try {
      const payload = await resetReceiveServiceHistory()
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `Service 수신 이력 ${payload.data?.cleared ?? 0}개를 전체 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const resetSelectedServiceReceiveHistory = async () => {
    if (!selectedReceiveService) {
      setFeedback({ tone: 'error', text: '리셋할 Service를 선택하세요.' })
      return
    }
    try {
      const payload = await resetReceiveServiceHistory({
        service_name: selectedReceiveService.service_name,
        service_type: selectedReceiveService.service_type,
      })
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `${selectedReceiveService.service_name} 수신 이력 ${payload.data?.cleared ?? 0}개를 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const startSelectedActionReceive = async () => {
    if (!selectedReceiveAction) {
      setFeedback({ tone: 'error', text: '수신할 Action을 선택하세요.' })
      return
    }
    try {
      await resetReceiveActionHistory({
        action_name: selectedReceiveAction.action_name,
        action_type: selectedReceiveAction.action_type,
      })
      setActiveReceiveActionKey(selectedReceiveActionKey)
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `${selectedReceiveAction.action_name} Action 수신 관찰을 시작했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const stopSelectedActionReceive = async () => {
    if (!activeReceiveActionKey) {
      setFeedback({ tone: 'warning', text: '수신 중인 Action 관찰 항목이 없습니다.' })
      return
    }
    setActiveReceiveActionKey('')
    setFeedback({ tone: 'warning', text: 'Action 수신 관찰을 중지했습니다.' })
  }

  const resetActionReceiveHistory = async () => {
    try {
      const payload = await resetReceiveActionHistory()
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `Action 수신 이력 ${payload.data?.cleared ?? 0}개를 전체 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const resetSelectedActionReceiveHistory = async () => {
    if (!selectedReceiveAction) {
      setFeedback({ tone: 'error', text: '리셋할 Action을 선택하세요.' })
      return
    }
    try {
      const payload = await resetReceiveActionHistory({
        action_name: selectedReceiveAction.action_name,
        action_type: selectedReceiveAction.action_type,
      })
      await loadReceiveState()
      setFeedback({
        tone: 'success',
        text: `${selectedReceiveAction.action_name} 수신 이력 ${payload.data?.cleared ?? 0}개를 리셋했습니다.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    }
  }

  const loadApplyStatus = useCallback(async () => {
    const payload = await fetchInterfaceApplyStatus()
    setApplyStatus(payload.data)
    setBuildLogTail(payload.data?.log_tail ?? '')
    return payload.data
  }, [])

  const loadRegistry = async (keepOpen = false) => {
    setBusy(true)
    try {
      const payload = await fetchInterfaceRegistry()
      setRegistry(payload.data)
      setShowRegistry(true)
      if (!keepOpen) {
        setShowPackages(false)
        setShowCallableTopics(false)
        setShowCallableServices(false)
        setShowCallableActions(false)
        setShowBuildLog(false)
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadPackages = async (keepOpen = false) => {
    setBusy(true)
    try {
      const payload = await fetchInterfacePackages()
      setPackages(payload.data ?? [])
      setShowPackages(true)
      if (!keepOpen) {
        setShowRegistry(false)
        setShowCallableTopics(false)
        setShowCallableServices(false)
        setShowCallableActions(false)
        setShowBuildLog(false)
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadCallableTopics = async (keepOpen = false) => {
    setBusy(true)
    try {
      const [messagesPayload, publishHistoryPayload] = await Promise.all([
        fetchCallableMessages(),
        fetchTopicPublishHistory({ limit: 100 }),
      ])
      const messages = messagesPayload.data ?? []
      setCallableMessages(messages)
      setTopicPublishHistory(publishHistoryPayload.data ?? [])
      setShowCallableTopics(true)
      if (!keepOpen) {
        setShowRegistry(false)
        setShowPackages(false)
        setShowCallableServices(false)
        setShowCallableActions(false)
        setShowBuildLog(false)
      }
      const selectableMessages = topicImportableOnly
        ? messages.filter((message) => message.import_available)
        : messages
      const selectedStillExists = selectableMessages.some(
        (message) => messageKey(message) === selectedMessageKey,
      )
      const nextSelected = selectedStillExists
        ? selectedMessageKey
        : selectableMessages[0] ? messageKey(selectableMessages[0]) : ''
      setSelectedMessageKey(nextSelected)
      const nextMessage = selectableMessages.find(
        (message) => messageKey(message) === nextSelected,
      )
      if (nextMessage) {
        setTopicMessageValues(defaultRequestValues(nextMessage.message_schema ?? []))
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const refreshInterfaceListsAfterDelete = async () => {
    const [registryPayload, packagesPayload, messagesPayload, servicesPayload, actionsPayload, statusPayload] = await Promise.all([
      fetchInterfaceRegistry(),
      fetchInterfacePackages(),
      fetchCallableMessages(),
      fetchCallableServices(),
      fetchCallableActions(),
      fetchInterfaceApplyStatus(),
    ])
    setRegistry(registryPayload.data)
    setPackages(packagesPayload.data ?? [])
    setCallableMessages(messagesPayload.data ?? [])
    setCallableServices(servicesPayload.data ?? [])
    setCallableActions(actionsPayload.data ?? [])
    setApplyStatus(statusPayload.data)
    setBuildLogTail(statusPayload.data?.log_tail ?? '')
    onStateChanged?.()
  }

  const removePackage = async (packageName) => {
    setBusy(true)
    try {
      await deleteInterfacePackage(packageName)
      setFeedback({
        tone: 'warning',
        text: `${packageName} package를 삭제했습니다. 적용하기로 build 상태를 갱신하세요.`,
      })
      await refreshInterfaceListsAfterDelete()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const removeRegistryEntry = async (item) => {
    setBusy(true)
    try {
      const payload = await deleteInterfaceRegistryEntry({
        kind: item.file_kind,
        fileName: item.file_name,
        source: item.source,
        fullType: item.full_type,
      })
      const deletedItem = {
        ...item,
        deletedAt: Date.now(),
        deletedMarker: true,
      }
      setRecentDeletedRegistry((current) => [
        deletedItem,
        ...current.filter((entry) => registryRowKey(entry) !== registryRowKey(item)),
      ].slice(0, 3))
      setFeedback({
        tone: 'warning',
        text: payload.data?.file_deleted
          ? `${item.file_name} 파일과 등록을 삭제하고 package metadata를 재생성했습니다.`
          : `${item.file_name} 등록을 삭제했습니다. 생성된 파일은 삭제하지 않았습니다.`,
      })
      await refreshInterfaceListsAfterDelete()
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const loadCallableServices = async (keepOpen = false) => {
    setBusy(true)
    try {
      const [servicesPayload, historyPayload] = await Promise.all([
        fetchCallableServices(),
        fetchServiceCallHistory(),
      ])
      const services = servicesPayload.data ?? []
      setCallableServices(services)
      setServiceCallHistory(historyPayload.data ?? [])
      setShowCallableServices(true)
      if (!keepOpen) {
        setShowRegistry(false)
        setShowPackages(false)
        setShowCallableTopics(false)
        setShowCallableActions(false)
        setShowBuildLog(false)
      }
      const selectableServices = serviceImportableOnly
        ? services.filter((service) => service.import_available)
        : services
      const selectedStillExists = selectableServices.some(
        (service) => serviceKey(service) === selectedServiceKey,
      )
      const nextSelected = selectedStillExists
        ? selectedServiceKey
        : selectableServices[0] ? serviceKey(selectableServices[0]) : ''
      setSelectedServiceKey(nextSelected)
      setSelectedReceiveServiceKey(nextSelected)
      const nextService = selectableServices.find(
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
    setBusy(true)
    try {
      const [actionsPayload, historyPayload] = await Promise.all([
        fetchCallableActions(),
        fetchActionGoalHistory(),
      ])
      const actions = actionsPayload.data ?? []
      setCallableActions(actions)
      setActionGoalHistory(historyPayload.data ?? [])
      setShowCallableActions(true)
      if (!keepOpen) {
        setShowRegistry(false)
        setShowPackages(false)
        setShowCallableTopics(false)
        setShowCallableServices(false)
        setShowBuildLog(false)
      }
      const selectableActions = actionImportableOnly
        ? actions.filter((action) => action.import_available)
        : actions
      const selectedStillExists = selectableActions.some(
        (action) => actionKey(action) === selectedActionKey,
      )
      const nextSelected = selectedStillExists
        ? selectedActionKey
        : selectableActions[0] ? actionKey(selectableActions[0]) : ''
      setSelectedActionKey(nextSelected)
      setSelectedReceiveActionKey(nextSelected)
      const nextAction = selectableActions.find(
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
        request: normalizeNumericValues(requestValues, selectedService.request_schema),
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
        full_type: selectedAction.full_type ?? selectedAction.selected_import_type ?? selectedAction.action_type,
        goal: normalizeNumericValues(goalValues, selectedAction.goal_schema),
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
        if (showCallableTopics) {
          const [messagesPayload, publishHistoryPayload] = await Promise.all([
            fetchCallableMessages(),
            fetchTopicPublishHistory({ limit: 100 }),
          ])
          const messages = messagesPayload.data ?? []
          setCallableMessages(messages)
          setTopicPublishHistory(publishHistoryPayload.data ?? [])
          setShowCallableTopics(true)
          const selectableMessages = topicImportableOnly
            ? messages.filter((message) => message.import_available)
            : messages
          const selectedStillExists = selectableMessages.some(
            (message) => messageKey(message) === selectedMessageKey,
          )
          const nextSelected = selectedStillExists
            ? selectedMessageKey
            : selectableMessages[0] ? messageKey(selectableMessages[0]) : ''
          setSelectedMessageKey(nextSelected)
          const nextMessage = selectableMessages.find(
            (message) => messageKey(message) === nextSelected,
          )
          if (nextMessage) {
            setTopicMessageValues(defaultRequestValues(nextMessage.message_schema ?? []))
          }
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
    selectedMessageKey,
    selectedServiceKey,
    showCallableActions,
    showCallableTopics,
    showCallableServices,
    showPackages,
    showRegistry,
    topicImportableOnly,
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

  useEffect(() => {
    if (!showReceivePanel || receiveMode === 'mock') return undefined
    const timer = window.setInterval(() => {
      loadReceiveState({ silent: true })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [
    activeReceiveActionKey,
    activeReceiveServiceKey,
    loadReceiveState,
    receiveMode,
    showReceivePanel,
  ])

  useEffect(() => {
    onTopicWorkspaceExpandedChange?.(topicExpandedActive)
    return () => onTopicWorkspaceExpandedChange?.(false)
  }, [onTopicWorkspaceExpandedChange, topicExpandedActive])

  return (
    <div className={topicExpandedActive ? 'interface-upload-control topic-workbench-expanded' : 'interface-upload-control'}>
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
      <button className="interface-type-entry-badge" disabled={disabled} onClick={() => setShowManualInput((value) => !value)} type="button">
        타입 기입
      </button>
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
      <button className="interface-topic-button" disabled={disabled} onClick={async () => {
        setShowReceivePanel(true)
        setReceiveMode('topic')
        await loadCallableTopics()
        await loadReceiveState({ silent: true })
      }} type="button">
        Topic 실행
      </button>
      <button className="interface-service-button" disabled={disabled} onClick={async () => {
        setShowReceivePanel(true)
        setReceiveMode('service')
        await loadCallableServices()
        await loadReceiveState({ silent: true })
      }} type="button">
        Service 실행
      </button>
      <button className="interface-action-button" disabled={disabled} onClick={async () => {
        setShowReceivePanel(true)
        setReceiveMode('action')
        await loadCallableActions()
        await loadReceiveState({ silent: true })
      }} type="button">
        Action 실행
      </button>
      <button className="interface-receive-button" disabled={disabled} onClick={() => {
        setShowReceivePanel(true)
        setShowCallableTopics(false)
        setShowCallableServices(false)
        setShowCallableActions(false)
        setShowManualInput(false)
        setShowRegistry(false)
        setShowPackages(false)
        setShowBuildLog(false)
        loadReceiveState()
      }} type="button">
        수신
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
      {showManualInput && (
        <div className="interface-manual-panel">
          <div className="interface-manual-tabs">
            <button className={manualMode === 'type' ? 'active' : ''} onClick={() => setManualMode('type')} type="button">
              타입 직접 등록
            </button>
            <button className={manualMode === 'definition' ? 'active' : ''} onClick={() => setManualMode('definition')} type="button">
              인터페이스 직접 작성
            </button>
          </div>
          {manualMode === 'type' ? (
            <div className="interface-manual-form">
              <p className="interface-package-help">
                이미 빌드/source 되어 있는 ROS2 타입을 allowlist에 등록합니다.
                파일은 생성하지 않으며 build도 필요하지 않습니다.
              </p>
              <label className="interface-service-field">
                <span>full type</span>
                <input value={manualType} onChange={(event) => setManualType(event.target.value)} />
              </label>
              <label className="interface-service-field">
                <span>description</span>
                <input value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} />
              </label>
              <button className="interface-service-call-button" disabled={disabled} onClick={submitManualType} type="button">
                타입 등록
              </button>
            </div>
          ) : (
            <div className="interface-manual-form">
              <p className="interface-package-help">
                .msg/.srv/.action 파일을 uploaded_interfaces 패키지에 직접 생성합니다.
                저장 전 문법 검증을 수행하며, 저장 후 적용하기 build가 필요합니다.
              </p>
              {editingManualDefinition && (
                <div className="interface-service-state warning">
                  수정 중: {editingManualDefinition.kind}/{editingManualDefinition.typeName}
                </div>
              )}
              <div className="interface-manual-fixed-path">
                저장 위치: backend/src/uploaded_interfaces/{manualKind}/{manualTypeName || 'TypeName'}.{manualKind}
              </div>
              <label className="interface-service-field">
                <span>kind</span>
                <select value={manualKind} onChange={(event) => setManualKind(event.target.value)}>
                  <option value="msg">msg</option>
                  <option value="srv">srv</option>
                  <option value="action">action</option>
                </select>
              </label>
              <label className="interface-service-field">
                <span>type name</span>
                <input value={manualTypeName} onChange={(event) => setManualTypeName(event.target.value)} />
              </label>
              <label className="interface-service-field">
                <span>definition</span>
                <textarea rows="8" value={manualDefinition} onChange={(event) => setManualDefinition(event.target.value)} />
              </label>
              <div className="interface-receive-actions">
                <button className="interface-receive-action-button ghost" disabled={disabled} onClick={validateCurrentManualDefinition} type="button">
                  문법 검증
                </button>
                <button className="interface-receive-action-button primary" disabled={disabled} onClick={submitManualDefinition} type="button">
                  {editingManualDefinition ? '인터페이스 수정 저장' : '인터페이스 저장'}
                </button>
                {editingManualDefinition && (
                  <button className="interface-receive-action-button" disabled={disabled} onClick={() => setEditingManualDefinition(null)} type="button">
                    수정 취소
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {showReceivePanel && (
        <div className="interface-receive-panel">
          <div className="interface-registry-heading interface-panel-heading">
            <strong>수신</strong>
            {receiveMode !== 'mock' && (
              <button
                aria-pressed={topicExpandedActive}
                className="interface-panel-expand-button"
                onClick={() => setTopicWorkspaceExpanded((value) => !value)}
                type="button"
              >
                {topicExpandedActive ? '목록보기' : '크게보기'}
              </button>
            )}
          </div>
          <div className="interface-manual-tabs">
            <button className={receiveMode === 'topic' ? 'active' : ''} onClick={async () => {
              setReceiveMode('topic')
              await loadCallableTopics()
              await loadReceiveState({ silent: true })
            }} type="button">Topic 수신</button>
            <button className={receiveMode === 'service' ? 'active' : ''} onClick={async () => {
              setReceiveMode('service')
              await loadCallableServices()
              await loadReceiveState({ silent: true })
            }} type="button">Service 수신</button>
            <button className={receiveMode === 'action' ? 'active' : ''} onClick={async () => {
              setReceiveMode('action')
              await loadCallableActions()
              await loadReceiveState({ silent: true })
            }} type="button">Action 수신</button>
            <button className={receiveMode === 'mock' ? 'active' : ''} onClick={() => {
              setReceiveMode('mock')
              setShowCallableTopics(false)
              setShowCallableServices(false)
              setShowCallableActions(false)
            }} type="button">Mock 준비중</button>
          </div>
          {receiveMode === 'topic' && (
            <div className="interface-receive-grid">
              <label className="interface-service-field">
                <span>항목 검색</span>
                <input
                  placeholder="Topic 이름 또는 type 검색"
                  value={receiveTopicSearch}
                  onChange={(event) => setReceiveTopicSearch(event.target.value)}
                />
              </label>
              <label className="interface-filter-check">
                <input
                  checked={topicImportableOnly}
                  onChange={(event) => setTopicImportableOnly(event.target.checked)}
                  type="checkbox"
                />
                <span>Message import됨만 보기</span>
                <small>{visibleCallableMessages.length}/{callableMessages.length}</small>
              </label>
              <label className="interface-service-field">
                <span>Message full_type · {visibleCallableMessages.length}/{callableMessages.length}개</span>
                <select
                  value={selectedMessageKey}
                  onChange={(event) => {
                    const key = event.target.value
                    const message = callableMessages.find((item) => messageKey(item) === key)
                    setSelectedMessageKey(key)
                    setTopicMessageValues(defaultRequestValues(message?.message_schema ?? []))
                    setTopicPublishResult(null)
                  }}
                >
                  {visibleCallableMessages.map((message) => (
                    <option key={messageKey(message)} value={messageKey(message)}>
                      {message.import_available ? 'import됨' : 'import 안됨'} · {topicStatusLabel(message)} · {topicGraphStatusLabel(message)} · {message.message_type ?? message.full_type}
                    </option>
                  ))}
                </select>
                {!visibleCallableMessages.length && (
                  <small>등록된 Message가 없습니다. 타입 기입에서 std_msgs/msg/String 같은 안전한 Message를 먼저 등록하세요.</small>
                )}
              </label>
              <label className="interface-service-field">
                <span>Graph Topic 후보 · {filteredReceiveTopics.length}/{availableTopics.length}</span>
                <select
                  value={selectedReceiveTopic}
                  onChange={(event) => {
                    selectedReceiveTopicSourceRef.current = event.target.value ? 'graph' : 'empty'
                    setSelectedReceiveTopic(event.target.value)
                  }}
                >
                  {filteredReceiveTopics.map((topic) => (
                    <option key={topic.name} value={topic.name}>{topic.name} · {topic.type ?? topic.types?.[0] ?? '-'}</option>
                  ))}
                </select>
                {!filteredReceiveTopics.length && (
                  <small>검색 결과가 없습니다.</small>
                )}
              </label>
              <label className="interface-service-field">
                <span>Subscribe Topic name</span>
                <input
                  placeholder="/interface_lab_topic_test"
                  value={selectedReceiveTopic}
                  onChange={(event) => {
                    selectedReceiveTopicSourceRef.current = event.target.value ? 'user' : 'empty'
                    setSelectedReceiveTopic(event.target.value)
                  }}
                />
              </label>
              <label className="interface-service-field">
                <span>선택 Message</span>
                <input readOnly value={selectedMessage?.message_type ?? ''} />
              </label>
              {selectedMessage && (
                <div className={`interface-service-state ${selectedMessage.import_available ? 'success' : 'warning'}`}>
                  {selectedMessage.import_available ? '수신 가능 · import됨' : '수신 불가 · import 안됨'}
                  {selectedMessage.import_error ? ` · ${selectedMessage.import_error}` : ''}
                </div>
              )}
              <p className="interface-package-help">
                Topic 수신은 선택한 Message full_type과 Subscribe Topic name 조합으로 시작합니다.
                Publish payload 입력과 Publish 버튼은 왼쪽 Topic 실행 창에서 처리합니다.
              </p>
              <div className="interface-receive-actions">
                <button
                  className={selectedTopicReceiving ? 'interface-receive-action-button receiving' : 'interface-receive-action-button primary'}
                  disabled={selectedTopicReceiving || !selectedMessage?.import_available}
                  onClick={startSelectedTopicReceive}
                  type="button"
                >
                  {selectedTopicReceiving ? '수신 중' : '수신 시작'}
                </button>
                <button className="interface-receive-action-button" onClick={stopSelectedTopicReceive} type="button">수신 중지</button>
                <button className="interface-receive-action-button warning" onClick={resetSelectedTopicReceiveHistory} type="button">선택 이력 리셋</button>
                <button className="interface-receive-action-button warning" onClick={resetAllTopicReceiveHistory} type="button">전체 이력 리셋</button>
                <button className="interface-receive-action-button ghost" onClick={loadReceiveState} type="button">새로고침</button>
              </div>
              <ReceiveHistory title="수신 중 Topic" items={receiveTopics} />
              <ReceiveHistory title="Topic subscribe latest/history" items={visibleReceiveTopicHistory} />
            </div>
          )}
          {receiveMode === 'service' && (
            <div className="interface-receive-grid">
              <label className="interface-service-field">
                <span>항목 검색</span>
                <input
                  placeholder="Service 이름 또는 type 검색"
                  value={receiveServiceSearch}
                  onChange={(event) => setReceiveServiceSearch(event.target.value)}
                />
              </label>
              <label className="interface-service-field">
                <span>Service · {filteredReceiveServices.length}/{callableServices.length}</span>
                <select value={selectedReceiveServiceKey} onChange={(event) => {
                  const key = event.target.value
                  const service = callableServices.find((item) => serviceKey(item) === key)
                  setSelectedReceiveServiceKey(key)
                  setSelectedServiceKey(key)
                  setRequestValues(defaultRequestValues(service?.request_schema ?? []))
                  setServiceCallResult(null)
                }}>
                  {filteredReceiveServices.map((service) => (
                    <option key={serviceKey(service)} value={serviceKey(service)}>
                      {service.service_name || service.file_name} · {service.service_type}
                    </option>
                  ))}
                </select>
                {!filteredReceiveServices.length && (
                  <small>검색 결과가 없습니다.</small>
                )}
              </label>
              <div className="interface-receive-actions">
                <button
                  className={selectedReceiveServiceKey && activeReceiveServiceKey === selectedReceiveServiceKey ? 'interface-receive-action-button receiving' : 'interface-receive-action-button primary'}
                  disabled={!selectedReceiveServiceKey || activeReceiveServiceKey === selectedReceiveServiceKey}
                  onClick={startSelectedServiceReceive}
                  type="button"
                >
                  {selectedReceiveServiceKey && activeReceiveServiceKey === selectedReceiveServiceKey ? '수신 중' : '수신 시작'}
                </button>
                <button className="interface-receive-action-button" onClick={stopSelectedServiceReceive} type="button">수신 중지</button>
                <button className="interface-receive-action-button warning" onClick={resetSelectedServiceReceiveHistory} type="button">선택 이력 리셋</button>
                <button className="interface-receive-action-button warning" onClick={resetServiceReceiveHistory} type="button">전체 이력 리셋</button>
                <button className="interface-receive-action-button ghost" onClick={loadReceiveState} type="button">새로고침</button>
              </div>
              <ReceiveHistory title="Service response receive history" items={visibleReceiveServiceHistory} />
            </div>
          )}
          {receiveMode === 'action' && (
            <div className="interface-receive-grid">
              <label className="interface-service-field">
                <span>항목 검색</span>
                <input
                  placeholder="Action 이름 또는 type 검색"
                  value={receiveActionSearch}
                  onChange={(event) => setReceiveActionSearch(event.target.value)}
                />
              </label>
              <label className="interface-service-field">
                <span>Action · {filteredReceiveActions.length}/{callableActions.length}</span>
                <select value={selectedReceiveActionKey} onChange={(event) => {
                  const key = event.target.value
                  const action = callableActions.find((item) => actionKey(item) === key)
                  setSelectedReceiveActionKey(key)
                  setSelectedActionKey(key)
                  setGoalValues(defaultRequestValues(action?.goal_schema ?? []))
                  setActionGoalResult(null)
                }}>
                  {filteredReceiveActions.map((action) => (
                    <option key={actionKey(action)} value={actionKey(action)}>
                      {action.action_name || action.file_name} · {action.action_type}
                    </option>
                  ))}
                </select>
                {!filteredReceiveActions.length && (
                  <small>검색 결과가 없습니다.</small>
                )}
              </label>
              <div className="interface-receive-actions">
                <button
                  className={selectedReceiveActionKey && activeReceiveActionKey === selectedReceiveActionKey ? 'interface-receive-action-button receiving' : 'interface-receive-action-button primary'}
                  disabled={!selectedReceiveActionKey || activeReceiveActionKey === selectedReceiveActionKey}
                  onClick={startSelectedActionReceive}
                  type="button"
                >
                  {selectedReceiveActionKey && activeReceiveActionKey === selectedReceiveActionKey ? '수신 중' : '수신 시작'}
                </button>
                <button className="interface-receive-action-button" onClick={stopSelectedActionReceive} type="button">수신 중지</button>
                <button className="interface-receive-action-button warning" onClick={resetSelectedActionReceiveHistory} type="button">선택 이력 리셋</button>
                <button className="interface-receive-action-button warning" onClick={resetActionReceiveHistory} type="button">전체 이력 리셋</button>
                <button className="interface-receive-action-button ghost" onClick={loadReceiveState} type="button">새로고침</button>
              </div>
              <ReceiveHistory title="Action feedback/result receive history" items={visibleReceiveActionHistory} />
            </div>
          )}
          {receiveMode === 'mock' && (
            <p className="interface-package-help">
              Service Server / Action Server mock receive는 준비중입니다. 자동으로 장비 제어 동작을 수행하지 않습니다.
            </p>
          )}
        </div>
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
            <div className="interface-build-log-panel">
              <div className="interface-registry-heading">
                <strong>상세 오류</strong>
              </div>
              <div className="interface-receive-actions">
                <button className="interface-receive-action-button ghost" disabled={disabled} onClick={regenerateUploadedInterfacesCmake} type="button">
                  CMake 재생성
                </button>
                <button className="interface-receive-action-button primary" disabled={disabled} onClick={applyUploadedInterfaces} type="button">
                  적용 다시 실행
                </button>
              </div>
              <pre className="interface-build-log">{buildLogTail}</pre>
            </div>
          )}
        </>
      )}
      {showRegistry && (
        <div className="interface-registry-panel">
          <div className="interface-registry-heading">
            <strong>등록된 타입</strong>
          </div>
          <RegistryGroup deletedItems={deletedRegistryItemsFor('msg', recentDeletedRegistry)} items={registry?.messages} label="Message" onDelete={removeRegistryEntry} onDeleteManual={removeManualDefinition} onEditManual={startEditManualDefinition} />
          <RegistryGroup deletedItems={deletedRegistryItemsFor('srv', recentDeletedRegistry)} items={registry?.services} label="Service" onDelete={removeRegistryEntry} onDeleteManual={removeManualDefinition} onEditManual={startEditManualDefinition} />
          <RegistryGroup deletedItems={deletedRegistryItemsFor('action', recentDeletedRegistry)} items={registry?.actions} label="Action" onDelete={removeRegistryEntry} onDeleteManual={removeManualDefinition} onEditManual={startEditManualDefinition} />
        </div>
      )}
      {showPackages && (
        <div className="interface-package-panel">
          <div className="interface-registry-heading interface-panel-heading">
            <strong>Uploaded Interface Packages</strong>
            <button
              aria-pressed={topicExpandedActive}
              className="interface-panel-expand-button"
              onClick={() => setTopicWorkspaceExpanded((value) => !value)}
              type="button"
            >
              {topicExpandedActive ? '목록보기' : '크게보기'}
            </button>
          </div>
          <p className="interface-package-help">
            장비가 실제 사용하는 원본 interface package를 패키지명 그대로 등록합니다.
          </p>
          <PackageRegistry
            packages={packages}
            onDelete={removePackage}
          />
        </div>
      )}
      {showCallableTopics && (
        <div className="interface-service-panel interface-execution-panel">
          <div className="interface-registry-heading interface-panel-heading">
            <strong>등록 Topic 실행</strong>
            {showReceivePanel && receiveMode === 'topic' && (
              <button
                aria-pressed={topicExpandedActive}
                className="interface-panel-expand-button"
                onClick={() => setTopicWorkspaceExpanded((value) => !value)}
                type="button"
              >
                {topicExpandedActive ? '목록보기' : '크게보기'}
              </button>
            )}
          </div>
          {callableMessages.length ? (
            <>
              <label className="interface-filter-check">
                <input
                  checked={topicImportableOnly}
                  onChange={(event) => setTopicImportableOnly(event.target.checked)}
                  type="checkbox"
                />
                <span>Message import됨만 보기</span>
                <small>{visibleCallableMessages.length}/{callableMessages.length}</small>
              </label>
              <label className="interface-service-field">
                <span>Message full_type · {visibleCallableMessages.length}/{callableMessages.length}개</span>
                <select
                  value={selectedMessageKey}
                  onChange={(event) => {
                    const key = event.target.value
                    const message = callableMessages.find((item) => messageKey(item) === key)
                    setSelectedMessageKey(key)
                    setTopicMessageValues(defaultRequestValues(message?.message_schema ?? []))
                    setTopicPublishResult(null)
                  }}
                >
                  {visibleCallableMessages.map((message) => (
                    <option key={messageKey(message)} value={messageKey(message)}>
                      {message.import_available ? 'import됨' : 'import 안됨'} · {topicStatusLabel(message)} · {topicGraphStatusLabel(message)} · {message.message_type ?? message.full_type}
                    </option>
                  ))}
                </select>
                {!visibleCallableMessages.length && (
                  <small>Message import됨 항목이 없습니다. 적용하기 또는 import-check 이후 다시 확인하세요.</small>
                )}
              </label>
              {selectedMessage && (
                <div className={`interface-service-state ${selectedMessage.import_available ? 'success' : 'warning'}`}>
                  {selectedMessage.import_available ? 'import됨' : 'import 안됨'}
                  {' · '}
                  {topicStatusLabel(selectedMessage)}
                  {' · '}
                  {topicGraphStatusLabel(selectedMessage)}
                  {selectedMessage.import_error ? ` · ${selectedMessage.import_error}` : ''}
                </div>
              )}
              <label className="interface-service-field">
                <span>기존 Graph Topic 후보</span>
                <select
                  value={publishGraphTopics.some((topic) => topic.name === topicPublishName) ? topicPublishName : ''}
                  onChange={(event) => {
                    topicPublishNameSourceRef.current = event.target.value ? 'graph' : 'empty'
                    setTopicPublishName(event.target.value)
                  }}
                >
                  <option value="">직접 입력</option>
                  {publishGraphTopics.map((topic) => (
                    <option key={topic.name} value={topic.name}>
                      {topic.name} · {topic.type ?? topic.types?.[0] ?? '-'}
                    </option>
                  ))}
                </select>
                <small>
                  선택하면 해당 Topic에 추가 Publisher로 발행합니다. 새 Topic을 만들려면 Publish Topic name을 직접 입력하세요.
                </small>
              </label>
              <label className="interface-service-field">
                <span>Publish Topic name</span>
                <input
                  placeholder="/interface_lab_topic_test"
                  value={topicPublishName}
                  onChange={(event) => {
                    topicPublishNameSourceRef.current = event.target.value ? 'user' : 'empty'
                    setTopicPublishName(event.target.value)
                  }}
                />
              </label>
              {selectedMessage && (
                <div className="interface-package-help">
                  선택 Message {selectedMessage.message_type}의 schema {selectedMessage.message_schema?.length ?? 0}개 필드로 payload 폼을 생성합니다.
                  사용자가 Publish 버튼을 누를 때만 1회 전송합니다.
                </div>
              )}
              {topicPublishWarning ? (
                <div className="interface-service-state warning">
                  {topicPublishWarning}
                </div>
              ) : null}
              {selectedMessage?.message_schema?.map((field) => (
                <RequestField
                  disabled={!selectedMessage?.import_available}
                  field={field}
                  key={field.name ?? field.raw_line}
                  onChange={(value) => setTopicMessageValues((current) => ({
                    ...current,
                    [field.name]: value,
                  }))}
                  value={topicMessageValues[field.name]}
                />
              ))}
              <button
                className="interface-service-call-button"
                disabled={topicPublishBusy || !selectedMessage?.import_available}
                onClick={publishSelectedTopicMessage}
                type="button"
              >
                {topicPublishBusy ? 'Publish 중…' : 'Publish'}
              </button>
              <div className="interface-receive-actions">
                <button className="interface-receive-action-button warning" onClick={resetSelectedTopicPublishHistory} type="button">Publish 이력 리셋</button>
              </div>
              {topicPublishResult && (
                <CallResultBlock
                  result={topicPublishResult}
                  successPayload={topicPublishResult.message_json ?? topicPublishResult.payload}
                />
              )}
              <ReceiveHistory title="Topic publish history" items={visiblePublishHistory} />
            </>
          ) : (
            <small>registry에 등록된 Message가 없습니다.</small>
          )}
        </div>
      )}
      {showCallableServices && (
        <div className="interface-service-panel interface-execution-panel">
          <div className="interface-registry-heading interface-panel-heading">
            <strong>등록 Service 실행</strong>
            {showReceivePanel && receiveMode === 'service' && (
              <button
                aria-pressed={topicExpandedActive}
                className="interface-panel-expand-button"
                onClick={() => setTopicWorkspaceExpanded((value) => !value)}
                type="button"
              >
                {topicExpandedActive ? '목록보기' : '크게보기'}
              </button>
            )}
          </div>
          {callableServices.length ? (
            <>
              <label className="interface-filter-check">
                <input
                  checked={serviceImportableOnly}
                  onChange={(event) => setServiceImportableOnly(event.target.checked)}
                  type="checkbox"
                />
                <span>Service import됨만 보기</span>
                <small>{visibleCallableServices.length}/{callableServices.length}</small>
              </label>
              <label className="interface-service-field">
                <span>Service · {visibleCallableServices.length}/{callableServices.length}개</span>
                <select
                  onChange={(event) => {
                    const key = event.target.value
                    const service = callableServices.find((item) => serviceKey(item) === key)
                    setSelectedServiceKey(key)
                    setSelectedReceiveServiceKey(key)
                    setRequestValues(defaultRequestValues(service?.request_schema ?? []))
                    setServiceCallResult(null)
                  }}
                  value={selectedServiceKey}
                >
                  {visibleCallableServices.map((service) => (
                    <option key={serviceKey(service)} value={serviceKey(service)}>
                      {service.import_available ? 'import됨' : 'import 안됨'} · {serviceStatusLabel(service)} · {service.service_name || service.file_name} · {service.service_type}
                    </option>
                  ))}
                </select>
                {!visibleCallableServices.length && (
                  <small>Service import됨 항목이 없습니다. 적용하기 또는 import-check 이후 다시 확인하세요.</small>
                )}
              </label>
              {selectedService && (
                <div className={`interface-service-state ${selectedService.callable ? 'success' : 'warning'}`}>
                  {serviceStatusLabel(selectedService)}
                  {selectedService.reason ? ` · ${selectedService.reason}` : ''}
                </div>
              )}
              {selectedService && (
                <div className="interface-package-help">
                  선택 타입 {selectedService.service_type}의 Request schema {selectedService.request_schema?.length ?? 0}개 필드로 폼을 생성합니다.
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
        <div className="interface-service-panel interface-execution-panel">
          <div className="interface-registry-heading interface-panel-heading">
            <strong>등록 Action 실행</strong>
            {showReceivePanel && receiveMode === 'action' && (
              <button
                aria-pressed={topicExpandedActive}
                className="interface-panel-expand-button"
                onClick={() => setTopicWorkspaceExpanded((value) => !value)}
                type="button"
              >
                {topicExpandedActive ? '목록보기' : '크게보기'}
              </button>
            )}
          </div>
          {callableActions.length ? (
            <>
              <label className="interface-filter-check">
                <input
                  checked={actionImportableOnly}
                  onChange={(event) => setActionImportableOnly(event.target.checked)}
                  type="checkbox"
                />
                <span>Action import됨만 보기</span>
                <small>{visibleCallableActions.length}/{callableActions.length}</small>
              </label>
              <label className="interface-service-field">
                <span>Action · {visibleCallableActions.length}/{callableActions.length}개</span>
                <select
                  onChange={(event) => {
                    const key = event.target.value
                    const action = callableActions.find((item) => actionKey(item) === key)
                    setSelectedActionKey(key)
                    setSelectedReceiveActionKey(key)
                    setGoalValues(defaultRequestValues(action?.goal_schema ?? []))
                    setActionGoalResult(null)
                  }}
                  value={selectedActionKey}
                >
                  {visibleCallableActions.map((action) => (
                    <option key={actionKey(action)} value={actionKey(action)}>
                      {action.import_available ? 'import됨' : 'import 안됨'} · {actionStatusLabel(action)} · {action.action_name || action.file_name} · {action.action_type}
                    </option>
                  ))}
                </select>
                {!visibleCallableActions.length && (
                  <small>Action import됨 항목이 없습니다. 적용하기 또는 import-check 이후 다시 확인하세요.</small>
                )}
              </label>
              {selectedAction && (
                <div className={`interface-service-state ${selectedAction.callable ? 'success' : 'warning'}`}>
                  {actionStatusLabel(selectedAction)}
                  {selectedAction.reason ? ` · ${selectedAction.reason}` : ''}
                </div>
              )}
              {selectedAction && (
                <div className="interface-package-help">
                  선택 타입 {selectedAction.action_type}의 Goal schema {selectedAction.goal_schema?.length ?? 0}개 필드로 폼을 생성합니다.
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
              <small>{item.import_available ? 'import됨' : item.import_error || 'import 안됨'}</small>
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
  if (item.import_available) return 'import됨'
  if (item.last_build_status === 'failed') return '빌드 실패'
  if (item.last_build_status === 'success') return 'import 안됨'
  return item.rebuild_required ? 'build 필요' : '업로드됨'
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
          입력값이 선택한 ROS2 타입과 맞지 않아 전송하지 않았습니다.
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
        onChange={(event) => onChange(event.target.value)}
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

function ReceiveHistory({ items = [], title }) {
  return (
    <div className="interface-receive-history">
      <strong>{title} · {items.length}개</strong>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}-${item.id ?? item.topic_name ?? item.service_name ?? item.action_name}`}>
              <span>
                {item.topic_name ?? item.service_name ?? item.action_name ?? item.direction ?? 'event'}
                {' · '}
                {item.status ?? (item.receiving ? 'receiving' : item.success === false ? 'failed' : 'ok')}
              </span>
              <pre>{JSON.stringify(item.last_message ?? item.message_json ?? item.response ?? item.result ?? item.feedback ?? item, null, 2)}</pre>
            </li>
          ))}
        </ul>
      ) : (
        <small>수신 이력이 없습니다.</small>
      )}
    </div>
  )
}

function serviceKey(service) {
  return `${service.service_name || service.file_name}|${service.service_type}`
}

function actionKey(action) {
  return `${action.action_name || action.file_name}|${action.action_type}`
}

function messageKey(message) {
  return `${message.message_type ?? message.full_type ?? message.file_name}|${message.source ?? ''}`
}

function topicStatusLabel(message) {
  if (message.import_available) return 'Publish 가능'
  return 'Publish 불가'
}

function topicGraphStatusLabel(message) {
  return message.graph_topics?.length ? 'Graph Topic 있음' : 'Graph Topic 없음'
}

function serviceStatusLabel(service) {
  if (service.callable) return '호출 가능'
  if (!service.import_available) return 'import 안됨'
  if (!service.server_available) return '서버 없음'
  return '호출 불가'
}

function actionStatusLabel(action) {
  if (action.callable) return '호출 가능'
  if (!action.import_available) return 'import 안됨'
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

function normalizeNumericValues(values, schema = []) {
  const numericFields = new Set(
    schema
      .filter((field) => field.name && isNumericType(field.type))
      .map((field) => field.name),
  )
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      numericFields.has(name) && value !== '' ? Number(value) : value,
    ]),
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

function registryRowKey(item) {
  return `${item.source ?? 'single'}-${item.full_type ?? item.file_name}-${item.file_kind ?? ''}`
}

function deletedRegistryItemsFor(kind, items = []) {
  return items.filter((item) => item.file_kind === kind)
}

function RegistryGroup({ deletedItems = [], items = [], label, onDelete, onDeleteManual, onEditManual }) {
  const rows = [
    ...items,
    ...deletedItems.filter((deleted) =>
      !items.some((item) => registryRowKey(item) === registryRowKey(deleted)),
    ),
  ]
  return (
    <div className="interface-registry-group">
      <span>{label} ({items.length})</span>
      {rows.length ? (
        <ul>{rows.map((item) => (
          <li
            className={item.deletedMarker ? 'interface-registry-row deleted' : 'interface-registry-row'}
            key={registryRowKey(item)}
          >
            <div>
              {item.file_name}
              <small>
                {item.deletedMarker ? '삭제됨 · 최근 삭제 표시 · ' : ''}
                {item.source ? `${item.source} · ` : ''}
                {item.build?.file_saved ? '파일 생성됨' : '파일 미생성'} · {' '}
                {item.build?.cmake_registered ? 'CMake 등록됨' : 'CMake 미등록'} · {' '}
                {item.build?.package_xml_checked ? 'package.xml 확인됨' : 'package.xml 미확인'} · {' '}
                {item.build?.rebuild_required ? '재빌드 필요' : '빌드 반영'} · {' '}
                {item.build?.import_available ? 'import됨' : 'import 안됨'}
                {item.build?.saved_path ? ` · ${item.build.saved_path}` : ''}
                {item.build?.error ? ` · 오류: ${item.build.error}` : ''}
              </small>
            </div>
            {item.deletedMarker ? (
              <span className="interface-registry-deleted-badge">삭제됨</span>
            ) : (
              <div className="interface-receive-actions">
                {item.source === 'manual_definition' && (
                  <>
                    <button onClick={() => onEditManual?.(item)} type="button">수정</button>
                    <button onClick={() => onDeleteManual?.(item)} type="button">파일 삭제</button>
                  </>
                )}
                <button onClick={() => onDelete?.(item)} type="button">등록 삭제</button>
              </div>
            )}
          </li>
        ))}</ul>
      ) : <small>등록 없음</small>}
    </div>
  )
}
