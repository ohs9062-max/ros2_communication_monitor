import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { InterfaceUploadControl } from '../components/InterfaceUploadControl.jsx'
import {
  graphPublishTopicCandidates,
  topicHasType,
  topicNameTypeWarning,
} from '../utils/interfaceTopics.js'
import {
  callRegisteredService,
  fetchCallableActions,
  fetchCallableMessages,
  fetchCallableServices,
  fetchActions,
  fetchTopics,
  fetchInterfaceApplyStatus,
  fetchInterfacePackages,
  fetchInterfaceRegistry,
  fetchReceiveTopicHistory,
  fetchReceiveTopics,
  fetchServices,
  fetchActionGoalHistory,
  fetchServiceCallHistory,
  fetchTopicPublishHistory,
  publishTopicMessage,
  resetReceiveTopicHistory,
  resetTopicPublishHistory,
  sendActionGoal,
  startReceiveTopic,
  stopReceiveTopic,
} from '../api/rosApi.js'

const GROUPS = [
  { id: 'all', label: '전체' },
  { id: 'messages', label: 'Message' },
  { id: 'services', label: 'Service' },
  { id: 'actions', label: 'Action' },
  { id: 'packages', label: 'Package' },
  { id: 'callable_services', label: '실행 가능 Service' },
  { id: 'callable_actions', label: '실행 가능 Action' },
  { id: 'importable', label: 'import됨' },
  { id: 'rebuild_required', label: 'build 필요' },
  { id: 'errors', label: '오류' },
]

export function InterfaceLabPage({ websocket }) {
  const [registry, setRegistry] = useState({ messages: [], services: [], actions: [] })
  const [applyStatus, setApplyStatus] = useState(null)
  const [callableMessages, setCallableMessages] = useState([])
  const [callableServices, setCallableServices] = useState([])
  const [callableActions, setCallableActions] = useState([])
  const [graphServices, setGraphServices] = useState([])
  const [graphActions, setGraphActions] = useState([])
  const [packages, setPackages] = useState([])
  const [serviceHistory, setServiceHistory] = useState([])
  const [actionHistory, setActionHistory] = useState([])
  const [topicPublishHistory, setTopicPublishHistory] = useState([])
  const [topicReceiveHistory, setTopicReceiveHistory] = useState([])
  const [receiveTopics, setReceiveTopics] = useState([])
  const [topics, setTopics] = useState([])
  const [activeGroup, setActiveGroup] = useState('all')
  const [selected, setSelected] = useState(null)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  const [requestValues, setRequestValues] = useState({})
  const [goalValues, setGoalValues] = useState({})
  const [messageValues, setMessageValues] = useState({})
  const [topicPublishName, setTopicPublishName] = useState('')
  const [topicSubscribeName, setTopicSubscribeName] = useState('')
  const topicPublishNameSourceRef = useRef('empty')
  const [timeoutSec, setTimeoutSec] = useState(2)
  const [goalTimeoutSec, setGoalTimeoutSec] = useState(10)
  const [executing, setExecuting] = useState(false)
  const [inlineResult, setInlineResult] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [workbenchResetKey, setWorkbenchResetKey] = useState(0)
  const [topicWorkbenchExpanded, setTopicWorkbenchExpanded] = useState(false)

  const refresh = async ({ notifyWorkbench = true } = {}) => {
    setRefreshing(true)
    const requests = [
      ['registry', fetchInterfaceRegistry()],
      ['status', fetchInterfaceApplyStatus()],
      ['callableMessages', fetchCallableMessages()],
      ['callableServices', fetchCallableServices()],
      ['callableActions', fetchCallableActions()],
      ['packages', fetchInterfacePackages()],
      ['serviceHistory', fetchServiceCallHistory()],
      ['actionHistory', fetchActionGoalHistory()],
      ['topicPublishHistory', fetchTopicPublishHistory()],
      ['topicReceiveHistory', fetchReceiveTopicHistory()],
      ['receiveTopics', fetchReceiveTopics()],
      ['topics', fetchTopics()],
      ['graphServices', fetchServices({ includeHidden: true })],
      ['graphActions', fetchActions()],
    ]
    try {
      const results = await Promise.allSettled(requests.map(([, request]) => request))
      const payloads = Object.fromEntries(
        results.flatMap((result, index) =>
          result.status === 'fulfilled' ? [[requests[index][0], result.value]] : []),
      )
      if (payloads.registry) setRegistry(payloads.registry.data ?? { messages: [], services: [], actions: [] })
      if (payloads.status) setApplyStatus(payloads.status.data ?? null)
      if (payloads.callableMessages) setCallableMessages(payloads.callableMessages.data ?? [])
      if (payloads.callableServices) setCallableServices(payloads.callableServices.data ?? [])
      if (payloads.callableActions) setCallableActions(payloads.callableActions.data ?? [])
      if (payloads.packages) setPackages(payloads.packages.data ?? [])
      if (payloads.serviceHistory) setServiceHistory(payloads.serviceHistory.data ?? [])
      if (payloads.actionHistory) setActionHistory(payloads.actionHistory.data ?? [])
      if (payloads.topicPublishHistory) setTopicPublishHistory(payloads.topicPublishHistory.data ?? [])
      if (payloads.topicReceiveHistory) setTopicReceiveHistory(payloads.topicReceiveHistory.data ?? [])
      if (payloads.receiveTopics) setReceiveTopics(payloads.receiveTopics.data ?? [])
      if (payloads.topics) setTopics(payloads.topics.data?.topics ?? payloads.topics.data ?? [])
      if (payloads.graphServices) setGraphServices(payloads.graphServices.data?.services ?? payloads.graphServices.data ?? [])
      if (payloads.graphActions) setGraphActions(payloads.graphActions.data?.actions ?? payloads.graphActions.data ?? [])

      const failures = results.filter((result) => result.status === 'rejected')
      setLastRefreshedAt(new Date())
      setError(failures.length
        ? new Error(`일부 상태를 불러오지 못했습니다(${failures.length}/${requests.length}). 연결 가능한 항목의 상태는 화면에 반영했습니다. ${failures[0].reason?.message ?? ''}`)
        : null)
      if (notifyWorkbench) {
        setRefreshSignal((value) => value + 1)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleWorkbenchStateChanged = () => {
    refresh({ notifyWorkbench: false })
  }

  const resetInterfaceLab = async () => {
    setActiveGroup('all')
    setSelected(null)
    setSelectedHistoryItem(null)
    setRequestValues({})
    setGoalValues({})
    setMessageValues({})
    topicPublishNameSourceRef.current = 'empty'
    setTopicPublishName('')
    setTopicSubscribeName('')
    setTimeoutSec(2)
    setGoalTimeoutSec(10)
    setInlineResult(null)
    setError(null)
    setTopicWorkbenchExpanded(false)
    setWorkbenchResetKey((value) => value + 1)
    await refresh({ notifyWorkbench: false })
  }

  useEffect(() => {
    refresh()
  }, [])

  const summary = useMemo(() => buildSummary({
    registry,
    callableActions,
    callableMessages,
    callableServices,
    graphActions,
    graphServices,
    packages,
  }), [registry, callableActions, callableMessages, callableServices, graphActions, graphServices, packages])
  const workspaceItems = useMemo(() => buildWorkspaceItems({
    actionHistory,
    callableActions,
    callableMessages,
    callableServices,
    filter: activeGroup,
    graphActions,
    graphServices,
    packages,
    registry,
    receiveTopics,
    serviceHistory,
    topicPublishHistory,
    topicReceiveHistory,
    topics,
  }), [actionHistory, activeGroup, callableActions, callableMessages, callableServices, graphActions, graphServices, packages, receiveTopics, registry, serviceHistory, topicPublishHistory, topicReceiveHistory, topics])
  const selectedDetail = workspaceItems.find((item) => item.id === selected?.id)
    ?? workspaceItems.find((item) => item.stableKey === selected?.stableKey)
    ?? null
  const publishGraphTopics = useMemo(
    () => graphPublishTopicCandidates(topics, selectedDetail?.fullType),
    [selectedDetail?.fullType, topics],
  )
  const selectedMessageDefaultTopic = selectedDetail?.connectedTopics?.[0]?.name
    ?? selectedDetail?.topicStates?.[0]?.topic_name
    ?? ''
  const topicPublishWarning = topicNameTypeWarning(
    topics,
    topicPublishName,
    selectedDetail?.fullType,
  )
  const relatedItems = useMemo(
    () => relatedWorkspaceItems(selectedDetail, workspaceItems),
    [selectedDetail, workspaceItems],
  )

  useEffect(() => {
    setSelectedHistoryItem(null)
    setInlineResult(null)
    if (selectedDetail?.kind === 'service' || selectedDetail?.kind === 'callable_service') {
      setRequestValues(defaultValues(selectedDetail.schema ?? []))
    } else if (selectedDetail?.kind === 'action' || selectedDetail?.kind === 'callable_action') {
      setGoalValues(defaultValues(selectedDetail.schema ?? []))
    } else if (selectedDetail?.kind === 'message') {
      setMessageValues(defaultValues(selectedDetail.schema ?? []))
      setTopicSubscribeName(selectedMessageDefaultTopic)
    }
  }, [selectedDetail?.kind, selectedDetail?.schema, selectedDetail?.stableKey, selectedMessageDefaultTopic])

  useEffect(() => {
    if (selectedDetail?.kind !== 'message') return
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
      const nextName = publishGraphTopics[0].name
      if (source === 'auto' && currentName === nextName) return
      topicPublishNameSourceRef.current = 'auto'
      setTopicPublishName(nextName)
    }
  }, [publishGraphTopics, selectedDetail?.kind, selectedDetail?.fullType, topicPublishName])

  const updateTopicPublishName = (value) => {
    topicPublishNameSourceRef.current = value ? 'user' : 'empty'
    setTopicPublishName(value)
  }

  const selectPublishGraphTopic = (value) => {
    topicPublishNameSourceRef.current = value ? 'graph' : 'empty'
    setTopicPublishName(value)
  }

  const executeSelectedService = async () => {
    const target = selectedDetail?.connectedServices?.find((service) => service.callable)
      ?? (selectedDetail?.kind === 'callable_service' ? selectedDetail.status : null)
    if (!target?.service_name || !target?.service_type) {
      setInlineResult({ success: false, error: '호출 가능한 Service가 없습니다.' })
      return
    }
    setExecuting(true)
    setInlineResult(null)
    try {
      const result = await callRegisteredService({
        service_name: target.service_name,
        service_type: target.service_type,
        request: normalizeNumericValues(requestValues, selectedDetail.schema),
        timeout_sec: timeoutSec,
      })
      setInlineResult(result)
      await refresh({ notifyWorkbench: false })
    } catch (nextError) {
      setInlineResult({ success: false, error: nextError.message, sent_to_server: false })
    } finally {
      setExecuting(false)
    }
  }

  const executeSelectedAction = async () => {
    const target = selectedDetail?.connectedActions?.find((action) => action.callable)
      ?? (selectedDetail?.kind === 'callable_action' ? selectedDetail.status : null)
    if (!target?.action_name || !target?.action_type) {
      setInlineResult({ success: false, accepted: false, error: '실행 가능한 Action이 없습니다.' })
      return
    }
    setExecuting(true)
    setInlineResult(null)
    try {
      const result = await sendActionGoal({
        action_name: target.action_name,
        action_type: target.action_type,
        full_type: target.full_type ?? target.selected_import_type ?? target.action_type,
        goal: normalizeNumericValues(goalValues, selectedDetail.schema),
        timeout_sec: goalTimeoutSec,
      })
      setInlineResult(result)
      await refresh({ notifyWorkbench: false })
    } catch (nextError) {
      setInlineResult({ success: false, accepted: false, error: nextError.message, sent_to_server: false })
    } finally {
      setExecuting(false)
    }
  }

  const publishSelectedTopic = async () => {
    if (!selectedDetail?.fullType) {
      setInlineResult({ success: false, error: 'Message full_type이 없습니다.' })
      return
    }
    if (!topicPublishName) {
      setInlineResult({ success: false, error: 'Publish할 Topic 이름을 입력하세요.' })
      return
    }
    setExecuting(true)
    setInlineResult(null)
    try {
      const result = await publishTopicMessage({
        topic_name: topicPublishName,
        topic_type: selectedDetail.fullType,
        full_type: selectedDetail.fullType,
        message: normalizeNumericValues(messageValues, selectedDetail.schema),
      })
      setInlineResult(result)
      await refresh({ notifyWorkbench: false })
    } catch (nextError) {
      setInlineResult({ success: false, error: nextError.message, sent_to_topic: false })
    } finally {
      setExecuting(false)
    }
  }

  const startSelectedTopicSubscribe = async () => {
    if (!selectedDetail?.fullType || !topicSubscribeName) {
      setInlineResult({ success: false, error: 'Topic 이름과 Message full_type이 필요합니다.' })
      return
    }
    try {
      const result = await startReceiveTopic({
        topic_name: topicSubscribeName,
        topic_type: selectedDetail.fullType,
        full_type: selectedDetail.fullType,
        history_limit: 500,
      })
      setInlineResult(result)
      await refresh({ notifyWorkbench: false })
    } catch (nextError) {
      setInlineResult({ success: false, error: nextError.message })
    }
  }

  const stopSelectedTopicSubscribe = async () => {
    if (!selectedDetail?.fullType || !topicSubscribeName) return
    try {
      const result = await stopReceiveTopic({
        topic_name: topicSubscribeName,
        topic_type: selectedDetail.fullType,
        full_type: selectedDetail.fullType,
      })
      setInlineResult(result)
      await refresh({ notifyWorkbench: false })
    } catch (nextError) {
      setInlineResult({ success: false, error: nextError.message })
    }
  }

  const resetSelectedTopicHistories = async () => {
    const payload = selectedDetail?.fullType && topicSubscribeName
      ? { topicName: topicSubscribeName, topicType: selectedDetail.fullType }
      : {}
    await Promise.all([
      resetReceiveTopicHistory(payload.topicName, payload.topicType),
      resetTopicPublishHistory(
        payload.topicName
          ? { topic_name: payload.topicName, topic_type: payload.topicType }
          : {},
      ),
    ])
    setInlineResult({ success: true, message: 'Topic Publish/Subscribe 이력을 초기화했습니다.' })
    await refresh({ notifyWorkbench: false })
  }

  return (
    <main className="interface-lab-page">
      <section className="interface-lab-hero">
        <div>
          <p className="eyebrow">Interface Lab</p>
          <h2>타입 등록, 빌드 적용, Service/Action 테스트</h2>
          <p>
            타입 등록은 “사용자가 이 타입을 쓰겠다”는 선언입니다.
            이미 설치되어 import됐고 Graph에 서버가 있는 타입만 실행 후보가 됩니다.
            Service request와 Action Goal은 사용자가 버튼을 누를 때만 전송됩니다.
          </p>
          <p className="interface-lab-note">
            단일 타입 등록만으로 없는 package, CMakeLists.txt, package.xml, 의존 msg 파일을 자동 생성하거나
            colcon build 성공을 보장하지 않습니다. 패키지 전체가 필요하면 Package zip/폴더 업로드를 사용하세요.
          </p>
        </div>
        <div className="interface-lab-actions">
          <button
            className="interface-reset-button"
            disabled={refreshing}
            onClick={resetInterfaceLab}
            type="button"
          >
            초기화
          </button>
          <button
            className="interface-refresh-button"
            disabled={refreshing}
            onClick={() => refresh()}
            type="button"
          >
            {refreshing ? '새로고침 중…' : '상태 새로고침'}
          </button>
          <span className="interface-refresh-meta" role="status">
            {refreshing
              ? 'registry / apply / callable 상태를 다시 읽는 중'
              : lastRefreshedAt
              ? `마지막 갱신 ${lastRefreshedAt.toLocaleTimeString()}`
              : '아직 갱신 전'}
          </span>
        </div>
      </section>

      <section className="interface-summary-grid">
        <SummaryCard label="Message" value={summary.messages} />
        <SummaryCard label="Message import됨" value={summary.callableMessages} />
        <SummaryCard label="Service" value={summary.services} />
        <SummaryCard label="Action" value={summary.actions} />
        <SummaryCard label="import됨" value={summary.importable} />
        <SummaryCard label="build 필요" value={summary.rebuildRequired} tone={summary.rebuildRequired ? 'warning' : 'success'} />
        <SummaryCard label="Package" value={summary.packages} />
        <SummaryCard label="실행 가능 Service" value={summary.callableServices} />
        <SummaryCard label="실행 가능 Action" value={summary.callableActions} />
      </section>

      <section className="interface-workbench-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload / Apply / Run</p>
            <h2>인터페이스 작업 도구</h2>
          </div>
          <span className={applyStatus?.real_apply_success && !summary.rebuildRequired ? 'status-pill success' : 'status-pill warning'}>
            {applyStatusLabel(applyStatus, summary.rebuildRequired > 0)}
          </span>
        </div>
        <InterfaceUploadControl
          key={workbenchResetKey}
          onStateChanged={handleWorkbenchStateChanged}
          onTopicWorkspaceExpandedChange={setTopicWorkbenchExpanded}
          refreshSignal={refreshSignal}
          websocket={websocket}
        />
        {error && <p className="interface-lab-error">{error.message}</p>}
      </section>

      {!topicWorkbenchExpanded && (
      <section className="interface-lab-layout">
        <div className="interface-registry-browser">
          <div className="interface-tabs">
            {GROUPS.map((group) => (
              <button
                className={activeGroup === group.id ? 'active' : ''}
                key={group.id}
                onClick={() => {
                  setActiveGroup(group.id)
                  setSelected(null)
                }}
                type="button"
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="interface-list-heading">
            <strong>항목 목록</strong>
            <span>{workspaceItems.length}개</span>
          </div>
          <div className="interface-card-list">
            {workspaceItems.map((item) => (
              <Fragment key={item.id}>
                <InterfaceCard
                  item={item}
                  onClick={() => {
                    setSelected((current) => current?.id === item.id ? null : item)
                    setSelectedHistoryItem(null)
                  }}
                  selected={selectedDetail?.id === item.id}
                />
                {selectedDetail?.id === item.id && (
                  <InlineWorkspace
                    executing={executing}
                    goalTimeoutSec={goalTimeoutSec}
                    goalValues={goalValues}
                    inlineResult={inlineResult}
                    item={selectedDetail}
                    onActionExecute={executeSelectedAction}
                    onGoalChange={setGoalValues}
                    onHistorySelect={setSelectedHistoryItem}
                    onMessageChange={setMessageValues}
                    onRelatedSelect={(nextItem) => {
                      setSelected(nextItem)
                      setSelectedHistoryItem(null)
                    }}
                    onRequestChange={setRequestValues}
                    onTopicPublish={publishSelectedTopic}
                    onServiceExecute={executeSelectedService}
                    onTopicReset={resetSelectedTopicHistories}
                    onTopicSubscribeStart={startSelectedTopicSubscribe}
                    onTopicSubscribeStop={stopSelectedTopicSubscribe}
                    relatedItems={relatedItems}
                    messageValues={messageValues}
                    requestValues={requestValues}
                    selectedHistoryItem={selectedHistoryItem}
                    setGoalTimeoutSec={setGoalTimeoutSec}
                    setTopicPublishName={updateTopicPublishName}
                    selectPublishGraphTopic={selectPublishGraphTopic}
                    setTopicSubscribeName={setTopicSubscribeName}
                    setTimeoutSec={setTimeoutSec}
                    topicPublishName={topicPublishName}
                    publishGraphTopics={publishGraphTopics}
                    topicPublishWarning={topicPublishWarning}
                    topicSubscribeName={topicSubscribeName}
                    timeoutSec={timeoutSec}
                  />
                )}
              </Fragment>
            ))}
            {!workspaceItems.length && (
              <p className="muted">표시할 항목이 없습니다.</p>
            )}
          </div>
        </div>
      </section>
      )}
    </main>
  )
}

function SummaryCard({ label, tone = 'neutral', value }) {
  return (
    <div className={`interface-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function applyStatusLabel(status, rebuildRequired = false) {
  if (rebuildRequired) return '등록 변경됨 · 빌드 필요'
  const value = status?.status ?? status?.build_status ?? 'idle'
  const labels = {
    failed: '빌드 실패',
    idle: '대기 중',
    import_failed: '빌드 성공 · import 확인 실패',
    partial: '일부 적용 필요',
    rebuild_required: '재빌드 필요',
    running: '빌드 진행 중',
    success: '적용 완료',
  }
  return labels[value] ?? value
}

function InterfaceCard({ item, onClick, selected }) {
  return (
    <button className={selected ? 'interface-card selected' : 'interface-card'} onClick={onClick} type="button">
      <span className="interface-card-line">
        <strong>{item.title}</strong>
        <span>/</span>
        <span>{item.subtitle}</span>
        {item.counts && (
          <span className="interface-count-badges">
            <CountBadge label="msg" tone="msg" value={item.counts.message} />
            <CountBadge label="srv" tone="srv" value={item.counts.service} />
            <CountBadge label="action" tone="action" value={item.counts.action} />
          </span>
        )}
      </span>
      <div className="interface-badge-row">
        <KindBadge kind={item.kind} />
        {(item.sources?.length ? item.sources : [item.source]).filter(Boolean).map((source) => (
          <Badge key={source} label={sourceLabel(source)} tone="blue" />
        ))}
        {item.graphOnly && <Badge label="미등록" tone="yellow" />}
        {item.packageName && <Badge label={item.packageName} tone="neutral" />}
        {item.importAvailable !== null && (
          <Badge label={item.importAvailable ? 'import됨' : 'import 안됨'} tone={item.importAvailable ? 'green' : 'yellow'} />
        )}
        {item.graphOnly && item.importAvailable === null && (
          <Badge label="import 확인 필요" tone="yellow" />
        )}
        {item.rebuildRequired && <Badge label="build 필요" tone="yellow" />}
        {item.serverAvailable !== null && (
          <Badge label={item.serverAvailable ? '서버 있음' : '서버 없음'} tone={item.serverAvailable ? 'green' : 'yellow'} />
        )}
        {item.callable !== null && (
          <Badge label={item.callable ? '실행 가능' : item.reason ?? '실행 불가'} tone={item.callable ? 'green' : 'yellow'} />
        )}
        {item.error && <Badge label="오류" tone="red" />}
      </div>
    </button>
  )
}

function KindBadge({ kind }) {
  const normalized = kind === 'callable_service' ? 'service'
    : kind === 'callable_action' ? 'action'
    : kind
  if (normalized === 'message') return <Badge label="msg" tone="msg" />
  if (normalized === 'service') return <Badge label="srv" tone="srv" />
  if (normalized === 'action') return <Badge label="action" tone="action" />
  if (normalized === 'package') return <Badge label="pkg" tone="package" />
  return null
}

function CountBadge({ label, tone, value }) {
  return <span className={`interface-count-badge ${tone}`}>{label} {value}</span>
}

function InlineWorkspace({
  executing,
  goalTimeoutSec,
  goalValues,
  inlineResult,
  item,
  onActionExecute,
  onGoalChange,
  onHistorySelect,
  onMessageChange,
  onRelatedSelect,
  onRequestChange,
  onServiceExecute,
  onTopicPublish,
  onTopicReset,
  onTopicSubscribeStart,
  onTopicSubscribeStop,
  relatedItems,
  messageValues,
  requestValues,
  selectedHistoryItem,
  selectPublishGraphTopic,
  setGoalTimeoutSec,
  setTopicPublishName,
  setTopicSubscribeName,
  setTimeoutSec,
  topicPublishName,
  publishGraphTopics,
  topicPublishWarning,
  topicSubscribeName,
  timeoutSec,
}) {
  const showDetail = item.kind !== 'package'
  return (
    <div className="interface-inline-workspace">
      {item.kind === 'package' && (
        <>
          <div className="interface-inline-heading">
            <strong>{item.title} 연결 항목</strong>
            <span>Service / Action을 누르면 여기서 바로 상세와 실행 폼을 봅니다.</span>
          </div>
          <div className="interface-related-grid">
            {relatedItems.length ? relatedItems.map((related) => (
              <button
                key={related.id}
                onClick={() => onRelatedSelect(related)}
                type="button"
              >
                <strong>{related.title}</strong>
                <span>{related.fullType}</span>
                <small>
                  {related.serverAvailable ? '서버 있음' : '서버 없음'}
                  {' · '}
                  {related.callable ? '실행 가능' : related.reason ?? '실행 대기'}
                </small>
              </button>
            )) : <p className="muted">연결된 Service/Action 항목이 없습니다.</p>}
          </div>
        </>
      )}
      {showDetail && (
        <InterfaceDetailPanel
          executing={executing}
          goalTimeoutSec={goalTimeoutSec}
          goalValues={goalValues}
          inlineResult={inlineResult}
          item={item}
          onActionExecute={onActionExecute}
          onGoalChange={onGoalChange}
          onHistorySelect={onHistorySelect}
          onMessageChange={onMessageChange}
          onRequestChange={onRequestChange}
          onServiceExecute={onServiceExecute}
          onTopicPublish={onTopicPublish}
          onTopicReset={onTopicReset}
          onTopicSubscribeStart={onTopicSubscribeStart}
          onTopicSubscribeStop={onTopicSubscribeStop}
          messageValues={messageValues}
          requestValues={requestValues}
          selectedHistoryItem={selectedHistoryItem}
          selectPublishGraphTopic={selectPublishGraphTopic}
          setGoalTimeoutSec={setGoalTimeoutSec}
          setTopicPublishName={setTopicPublishName}
          setTopicSubscribeName={setTopicSubscribeName}
          setTimeoutSec={setTimeoutSec}
          topicPublishName={topicPublishName}
          publishGraphTopics={publishGraphTopics}
          topicPublishWarning={topicPublishWarning}
          topicSubscribeName={topicSubscribeName}
          timeoutSec={timeoutSec}
        />
      )}
    </div>
  )
}

function InterfaceDetailPanel({
  executing,
  goalTimeoutSec,
  goalValues,
  inlineResult,
  item,
  onActionExecute,
  onGoalChange,
  onHistorySelect,
  onMessageChange,
  onRequestChange,
  onServiceExecute,
  onTopicPublish,
  onTopicReset,
  onTopicSubscribeStart,
  onTopicSubscribeStop,
  messageValues,
  requestValues,
  selectedHistoryItem,
  selectPublishGraphTopic,
  setGoalTimeoutSec,
  setTopicPublishName,
  setTopicSubscribeName,
  setTimeoutSec,
  topicPublishName,
  publishGraphTopics,
  topicPublishWarning,
  topicSubscribeName,
  timeoutSec,
}) {
  if (!item) {
    return (
      <aside className="interface-detail-panel">
        <h3>상세</h3>
        <p className="muted">항목을 선택하세요.</p>
      </aside>
    )
  }
  return (
    <aside className="interface-detail-panel">
      <h3>{item.title}</h3>
      <dl>
        <dt>source</dt>
        <dd>{(item.sources?.length ? item.sources : [item.source]).filter(Boolean).map(sourceLabel).join(', ')}</dd>
        <dt>full type</dt>
        <dd>{item.fullType ?? '-'}</dd>
        <dt>package</dt>
        <dd>{item.packageName ?? '-'}</dd>
        <dt>import</dt>
        <dd>{item.importAvailable === null ? '-' : item.importAvailable ? 'import됨' : 'import 안됨'}</dd>
        <dt>build</dt>
        <dd>{item.rebuildRequired ? 'build 필요' : '빌드 반영/대기'}</dd>
        <dt>server</dt>
        <dd>{item.serverAvailable === null ? '-' : item.serverAvailable ? '서버 있음' : '서버 없음'}</dd>
        <dt>callable</dt>
        <dd>{item.callable === null ? '-' : item.callable ? '실행 가능' : item.reason ?? '실행 불가'}</dd>
        {item.error && (
          <>
            <dt>error</dt>
            <dd>{item.error}</dd>
          </>
        )}
      </dl>
      <CollapsibleJson title="상태 상세" value={item.status ?? {}} />
      <CollapsibleJson title="parsed / schema" value={item.parsed ?? item.schema ?? {}} />
      <CollapsibleText title="raw_text" value={item.raw_text ?? ''} />
      {item.kind === 'message' && (
        <TopicWorkspaceDetail
          executing={executing}
          inlineResult={inlineResult}
          item={item}
          messageValues={messageValues}
          onHistorySelect={onHistorySelect}
          onMessageChange={onMessageChange}
          onPublish={onTopicPublish}
          onReset={onTopicReset}
          onSubscribeStart={onTopicSubscribeStart}
          onSubscribeStop={onTopicSubscribeStop}
          selectedHistoryItem={selectedHistoryItem}
          selectPublishGraphTopic={selectPublishGraphTopic}
          setTopicPublishName={setTopicPublishName}
          setTopicSubscribeName={setTopicSubscribeName}
          topicPublishName={topicPublishName}
          publishGraphTopics={publishGraphTopics}
          topicPublishWarning={topicPublishWarning}
          topicSubscribeName={topicSubscribeName}
        />
      )}
      {(item.kind === 'service' || item.kind === 'callable_service') && (
        <ServiceWorkspaceDetail
          executing={executing}
          inlineResult={inlineResult}
          item={item}
          onExecute={onServiceExecute}
          onHistorySelect={onHistorySelect}
          onRequestChange={onRequestChange}
          requestValues={requestValues}
          selectedHistoryItem={selectedHistoryItem}
          setTimeoutSec={setTimeoutSec}
          timeoutSec={timeoutSec}
        />
      )}
      {(item.kind === 'action' || item.kind === 'callable_action') && (
        <ActionWorkspaceDetail
          executing={executing}
          goalTimeoutSec={goalTimeoutSec}
          goalValues={goalValues}
          inlineResult={inlineResult}
          item={item}
          onExecute={onActionExecute}
          onGoalChange={onGoalChange}
          onHistorySelect={onHistorySelect}
          selectedHistoryItem={selectedHistoryItem}
          setGoalTimeoutSec={setGoalTimeoutSec}
        />
      )}
    </aside>
  )
}

function ServiceWorkspaceDetail({
  executing,
  inlineResult,
  item,
  onExecute,
  onHistorySelect,
  onRequestChange,
  requestValues,
  selectedHistoryItem,
  setTimeoutSec,
  timeoutSec,
}) {
  const callableTarget = item.connectedServices?.find((service) => service.callable)
    ?? (item.kind === 'callable_service' ? item.status : null)
  return (
    <>
      <SectionTitle title="연결된 Graph Service" />
      <ConnectionList
        empty="이 타입으로 열린 Service가 없습니다."
        items={item.connectedServices}
        render={(service) => `${service.service_name || '서버 없음'} · servers ${service.server_count ?? 0} · ${service.callable ? '실행 가능' : service.reason ?? '실행 불가'}`}
      />
      <SectionTitle title="실행 폼" />
      {callableTarget ? (
        <>
          {schemaFields(item.schema).map((field) => (
            <RequestField
              field={field}
              key={field.name ?? field.raw_line}
              onChange={(value) => onRequestChange((current) => ({
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
              onChange={(event) => setTimeoutSec(Number(event.target.value))}
              step="0.1"
              type="number"
              value={timeoutSec}
            />
          </label>
          <button
            className="interface-service-call-button"
            disabled={executing || !callableTarget.callable}
            onClick={onExecute}
            type="button"
          >
            {executing ? '실행 중…' : `${callableTarget.service_name} 실행`}
          </button>
        </>
      ) : (
        <p className="muted">import됐고 서버가 있는 Service가 있을 때 실행 폼이 활성화됩니다.</p>
      )}
      <LastResultBlock fallback={item.lastRun} result={inlineResult} title="마지막 호출 결과" />
      <HistoryList
        empty="최근 호출 이력이 없습니다."
        items={item.history}
        onSelect={onHistorySelect}
        selected={selectedHistoryItem}
        type="service"
      />
    </>
  )
}

function TopicWorkspaceDetail({
  executing,
  inlineResult,
  item,
  messageValues,
  onHistorySelect,
  onMessageChange,
  onPublish,
  onReset,
  onSubscribeStart,
  onSubscribeStop,
  publishGraphTopics,
  selectedHistoryItem,
  selectPublishGraphTopic,
  setTopicPublishName,
  setTopicSubscribeName,
  topicPublishName,
  topicPublishWarning,
  topicSubscribeName,
}) {
  const activeSubscription = (item.topicStates ?? []).find(
    (state) => state.topic_name === topicSubscribeName && state.topic_type === item.fullType,
  )
  return (
    <>
      <SectionTitle title="연결된 Graph Topic" />
      <ConnectionList
        empty="Graph에서 이 Message full_type으로 열린 Topic이 없습니다."
        items={item.connectedTopics}
        render={(topic) => [
          topic.name,
          firstType(topic.type ?? topic.types) ?? '-',
          `publishers ${topic.publisher_count ?? 0}`,
          `subscribers ${topic.subscriber_count ?? 0}`,
        ].join(' · ')}
      />
      {(item.graphConflicts ?? []).length > 0 && (
        <CollapsibleJson
          title="같은 Topic 이름의 다른 type 경고"
          value={item.graphConflicts}
        />
      )}

      <SectionTitle title="Topic Publish" />
      <label className="interface-service-field">
        <span>기존 Graph Topic 후보</span>
        <select
          onChange={(event) => selectPublishGraphTopic(event.target.value)}
          value={publishGraphTopics.some((topic) => topic.name === topicPublishName) ? topicPublishName : ''}
        >
          <option value="">직접 입력</option>
          {publishGraphTopics.map((topic) => (
            <option key={topic.name} value={topic.name}>
              {topic.name} · {firstType(topic.type ?? topic.types) ?? '-'}
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
          onChange={(event) => setTopicPublishName(event.target.value)}
          placeholder="/demo_topic"
          type="text"
          value={topicPublishName}
        />
      </label>
      {topicPublishWarning && (
        <div className="interface-service-state warning">{topicPublishWarning}</div>
      )}
      <p className="muted">
        full_type {item.fullType} · QoS {item.qos?.profile ?? 'default'} depth {item.qos?.depth ?? 10}
      </p>
      {schemaFields(item.schema).map((field) => (
        <RequestField
          field={field}
          key={field.name ?? field.raw_line}
          onChange={(value) => onMessageChange((current) => ({
            ...current,
            [field.name]: value,
          }))}
          value={messageValues[field.name]}
        />
      ))}
      <button
        className="interface-service-call-button"
        disabled={executing || !item.importAvailable}
        onClick={onPublish}
        type="button"
      >
        {executing ? 'Publish 중…' : '1회 Publish'}
      </button>

      <SectionTitle title="Topic Subscribe" />
      <label className="interface-service-field">
        <span>topic_name</span>
        <input
          onChange={(event) => setTopicSubscribeName(event.target.value)}
          placeholder="/demo_topic"
          type="text"
          value={topicSubscribeName}
        />
      </label>
      <p className="muted">
        Subscription key는 topic_name + full_type입니다. 같은 이름이라도 package/type이 다르면 별도 구독입니다.
      </p>
      <div className="interface-inline-actions">
        <button disabled={!item.importAvailable} onClick={onSubscribeStart} type="button">
          {activeSubscription ? '수신중 · 설정 갱신' : '수신 시작'}
        </button>
        <button disabled={!activeSubscription} onClick={onSubscribeStop} type="button">
          수신 중지
        </button>
        <button onClick={onReset} type="button">
          Publish/Subscribe 이력 초기화
        </button>
      </div>
      {activeSubscription && (
        <CollapsibleJson
          title={`수신 상태 · ${activeSubscription.message_count ?? 0}개`}
          value={activeSubscription}
        />
      )}

      <LastResultBlock fallback={item.lastRun} result={inlineResult} title="마지막 Topic 작업 결과" />
      <HistoryList
        empty="최근 Topic Publish/Subscribe 이력이 없습니다."
        items={item.history}
        onSelect={onHistorySelect}
        selected={selectedHistoryItem}
        type="topic"
      />
    </>
  )
}

function ActionWorkspaceDetail({
  executing,
  goalTimeoutSec,
  goalValues,
  inlineResult,
  item,
  onExecute,
  onGoalChange,
  onHistorySelect,
  selectedHistoryItem,
  setGoalTimeoutSec,
}) {
  const callableTarget = item.connectedActions?.find((action) => action.callable)
    ?? (item.kind === 'callable_action' ? item.status : null)
  return (
    <>
      <SectionTitle title="연결된 Graph Action" />
      <ConnectionList
        empty="이 타입으로 열린 Action이 없습니다."
        items={item.connectedActions}
        render={(action) => [
          `action name ${action.action_name || '서버 없음'}`,
          `graph type ${action.graph_type ?? action.action_type ?? '-'}`,
          `selected/import type ${action.selected_import_type ?? action.full_type ?? item.fullType ?? '-'}`,
          `exact-type servers ${action.server_count ?? 0}`,
          (action.executable ?? action.callable)
            ? 'exact-type 실행 가능'
            : action.reason ?? 'exact-type 실행 불가',
        ].join(' · ')}
      />
      <SectionTitle title="Goal 입력 폼" />
      {callableTarget ? (
        <>
          {schemaFields(item.schema).map((field) => (
            <RequestField
              field={field}
              key={field.name ?? field.raw_line}
              onChange={(value) => onGoalChange((current) => ({
                ...current,
                [field.name]: value,
              }))}
              value={goalValues[field.name]}
            />
          ))}
          <label className="interface-service-field">
            <span>timeout_sec</span>
            <input
              min="0.1"
              onChange={(event) => setGoalTimeoutSec(Number(event.target.value))}
              step="0.1"
              type="number"
              value={goalTimeoutSec}
            />
          </label>
          <button
            className="interface-service-call-button"
            disabled={executing || !callableTarget.callable}
            onClick={onExecute}
            type="button"
          >
            {executing ? '요청 전송 중…' : `${callableTarget.action_name} Goal 실행`}
          </button>
        </>
      ) : (
        <p className="muted">import됐고 서버가 있는 Action이 있을 때 Goal 폼이 활성화됩니다.</p>
      )}
      <LastResultBlock fallback={item.lastRun} result={inlineResult} title="마지막 실행 결과" />
      <SectionTitle title="Action 관련 Topic" />
      <ConnectionList
        empty="관련 action topic이 아직 snapshot에 없습니다."
        items={item.connectedTopics}
        render={(topic) => `${topic.name} · ${topic.type ?? topic.types?.[0] ?? '-'} · ${topic.last_received_at ? `last ${formatTime(topic.last_received_at)}` : '아직 수신 없음'} · count ${topic.message_count ?? topic.received_count ?? 0}`}
      />
      <HistoryList
        empty="최근 Goal 이력이 없습니다."
        items={item.history}
        onSelect={onHistorySelect}
        selected={selectedHistoryItem}
        type="action"
      />
    </>
  )
}

function SectionTitle({ title }) {
  return <h4 className="interface-detail-section-title">{title}</h4>
}

function ConnectionList({ empty, items = [], render }) {
  if (!items.length) return <p className="muted">{empty}</p>
  return (
    <ul className="interface-connection-list">
      {items.map((item, index) => (
        <li key={`${index}-${render(item)}`}>{render(item)}</li>
      ))}
    </ul>
  )
}

function LastResultBlock({ fallback, result, title }) {
  const value = result ?? fallback
  if (!value) return <CollapsibleJson title={title} value={{ status: '아직 결과 없음' }} />
  return <CollapsibleJson title={title} value={value} />
}

function HistoryList({ empty, items = [], onSelect, selected, type }) {
  if (!items.length) return <p className="muted">{empty}</p>
  return (
    <div className="interface-history-list">
      <SectionTitle title={type === 'service' ? '최근 호출 이력' : '최근 실행 이력'} />
      {items.slice(0, 20).map((item) => (
        <button
          className={selected === item ? 'selected' : ''}
          key={historyKey(item, type)}
          onClick={() => onSelect(selected === item ? null : item)}
          type="button"
        >
          {historyLabel(item, type)}
        </button>
      ))}
      {selected && <CollapsibleJson title="선택한 이력 전체 JSON" value={selected} />}
    </div>
  )
}

function Badge({ label, tone = 'neutral' }) {
  return <span className={`interface-badge ${tone}`}>{label}</span>
}

function CollapsibleJson({ title, value }) {
  return (
    <details className="interface-detail-block">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}

function CollapsibleText({ title, value }) {
  return (
    <details className="interface-detail-block">
      <summary>{title}</summary>
      <pre>{value}</pre>
    </details>
  )
}

function buildSummary({ callableActions, callableMessages = [], callableServices, packages, registry }) {
  const items = [
    ...(registry.messages ?? []),
    ...(registry.services ?? []),
    ...(registry.actions ?? []),
  ]
  return {
    actions: registry.actions?.length ?? 0,
    callableActions: callableActions.filter((item) => item.callable).length,
    callableMessages: callableMessages.filter((item) => item.import_available).length,
    callableServices: callableServices.filter((item) => item.callable).length,
    importable: items.filter((item) => item.build?.import_available).length,
    messages: registry.messages?.length ?? 0,
    packages: packages?.length ?? 0,
    rebuildRequired: items.filter((item) => item.build?.rebuild_required).length,
    services: registry.services?.length ?? 0,
  }
}

function buildWorkspaceItems({
  actionHistory,
  callableActions,
  callableMessages = [],
  callableServices,
  filter,
  graphActions = [],
  graphServices = [],
  packages,
  receiveTopics = [],
  registry,
  serviceHistory,
  topicPublishHistory = [],
  topicReceiveHistory = [],
  topics,
}) {
  const graphServiceEntries = mergeGraphServiceEntries(graphServices, callableServices)
  const graphActionEntries = mergeGraphActionEntries(graphActions, callableActions)
  const messagesByType = Object.fromEntries(
    callableMessages.map((item) => [item.message_type ?? item.full_type ?? item.topic_type, item]),
  )
  const servicesByType = groupByType(graphServiceEntries, 'service_type')
  const actionsByType = groupByType(graphActionEntries, 'action_type')
  const topicContext = {
    messagesByType,
    receiveTopics,
    topicPublishHistory,
    topicReceiveHistory,
  }
  const items = [
    ...(registry.messages ?? []).map((item) => registryItem(item, 'message', {
      actionsByType,
      actionHistory,
      servicesByType,
      serviceHistory,
      ...topicContext,
      topics,
    })),
    ...(registry.services ?? []).map((item) => registryItem(item, 'service', {
      actionsByType,
      actionHistory,
      history: serviceHistory,
      servicesByType,
      topics,
    })),
    ...(registry.actions ?? []).map((item) => registryItem(item, 'action', {
      actionsByType,
      history: actionHistory,
      servicesByType,
      serviceHistory,
      topics,
    })),
    ...(packages ?? []).flatMap((item) => packageItems(item, {
      actionsByType,
      actionHistory,
      servicesByType,
      serviceHistory,
      ...topicContext,
      topics,
    })),
    ...graphServiceEntries.map((item) => callableServiceItem(item, serviceHistory)),
    ...graphActionEntries.map((item) => callableActionItem(item, actionHistory, actionsByType, topics)),
  ]

  return mergeWorkspaceItemsByType(items, topics)
    .filter((item) => !item.graphOnly)
    .filter((item) => matchesWorkspaceFilter(item, filter))
}

function mergeGraphServiceEntries(graphServices = [], callableServices = []) {
  const byKey = new Map()
  graphServices.forEach((item) => {
    const serviceName = item.service_name ?? item.name
    const serviceType = firstType(item.service_type ?? item.type ?? item.types)
    if (!serviceName || !serviceType) return
    byKey.set(`${serviceName}|${serviceType}`, {
      ...item,
      callable: false,
      service_name: serviceName,
      service_type: serviceType,
      server_available: (item.server_count ?? 0) > 0,
    })
  })
  callableServices.forEach((item) => {
    const serviceName = item.service_name ?? item.name
    const serviceType = firstType(item.service_type ?? item.type)
    if (!serviceName || !serviceType) return
    byKey.set(`${serviceName}|${serviceType}`, {
      ...(byKey.get(`${serviceName}|${serviceType}`) ?? {}),
      ...item,
      service_name: serviceName,
      service_type: serviceType,
    })
  })
  return Array.from(byKey.values())
}

function mergeGraphActionEntries(graphActions = [], callableActions = []) {
  const byKey = new Map()
  graphActions.forEach((item) => {
    const actionName = item.action_name ?? item.name
    const actionType = firstType(item.action_type ?? item.type ?? item.types)
    if (!actionName || !actionType) return
    byKey.set(`${actionName}|${actionType}`, {
      ...item,
      action_name: actionName,
      action_type: actionType,
      callable: false,
      server_available: (item.server_count ?? 0) > 0,
    })
  })
  callableActions.forEach((item) => {
    const actionName = item.action_name ?? item.name
    const actionType = firstType(item.action_type ?? item.type)
    if (!actionName || !actionType) return
    byKey.set(`${actionName}|${actionType}`, {
      ...(byKey.get(`${actionName}|${actionType}`) ?? {}),
      ...item,
      action_name: actionName,
      action_type: actionType,
    })
  })
  return Array.from(byKey.values())
}

function mergeWorkspaceItemsByType(items = [], topics = []) {
  const packageItems = items.filter((item) => item.kind === 'package')
  const mergeableItems = items.filter((item) => item.kind !== 'package')
  const byKey = new Map()
  mergeableItems.forEach((item) => {
    const normalizedKind = normalizeWorkspaceKind(item.kind)
    const fullType = item.fullType
    if (!fullType) return
    const key = `${normalizedKind}:${fullType}`
    const current = byKey.get(key)
    byKey.set(key, current ? mergeWorkspaceItem(current, item) : normalizeMergeItem(item, normalizedKind))
  })
  return [
    ...packageItems,
    ...Array.from(byKey.values()).map((item) => finalizeMergedWorkspaceItem(item, topics)),
  ]
}

function normalizeMergeItem(item, normalizedKind) {
  const source = item.source ?? (item.status?.source) ?? 'unknown'
  return {
    ...item,
    graphOnly: source === 'graph',
    id: `${normalizedKind}:${item.fullType}`,
    kind: normalizedKind,
    sources: uniqueStrings([...(item.sources ?? []), source]),
    stableKey: `${normalizedKind}:${item.fullType}`,
  }
}

function mergeWorkspaceItem(left, right) {
  const normalizedRight = normalizeMergeItem(right, normalizeWorkspaceKind(right.kind))
  const connectedServices = mergeByNameAndType(
    [...(left.connectedServices ?? []), ...(normalizedRight.connectedServices ?? [])],
    'service_name',
    'service_type',
  )
  const connectedActions = mergeByNameAndType(
    [...(left.connectedActions ?? []), ...(normalizedRight.connectedActions ?? [])],
    'action_name',
    'action_type',
  )
  const topicStates = mergeByNameAndType(
    [...(left.topicStates ?? []), ...(normalizedRight.topicStates ?? [])],
    'topic_name',
    'topic_type',
  )
  const graphConflicts = [
    ...(left.graphConflicts ?? []),
    ...(normalizedRight.graphConflicts ?? []),
  ]
  const sources = uniqueStrings([...(left.sources ?? []), ...(normalizedRight.sources ?? [])])
  const history = mergeHistory([...(left.history ?? []), ...(normalizedRight.history ?? [])])
  return {
    ...left,
    callable: [...connectedServices, ...connectedActions].some((entry) => entry.callable) || left.callable || normalizedRight.callable || null,
    connectedActions,
    connectedServices,
    connectedTopics: [...(left.connectedTopics ?? []), ...(normalizedRight.connectedTopics ?? [])],
    error: left.error ?? normalizedRight.error,
    graphOnly: left.graphOnly && normalizedRight.graphOnly,
    history,
    importAvailable: left.importAvailable ?? normalizedRight.importAvailable,
    lastRun: history[0] ?? left.lastRun ?? normalizedRight.lastRun,
    packageName: left.packageName ?? normalizedRight.packageName,
    parsed: hasMeaningfulParsed(left.parsed) ? left.parsed : normalizedRight.parsed,
    raw_text: left.raw_text || normalizedRight.raw_text,
    reason: left.reason ?? normalizedRight.reason,
    rebuildRequired: left.rebuildRequired || normalizedRight.rebuildRequired,
    schema: schemaFields(left.schema).length ? left.schema : normalizedRight.schema,
    serverAvailable: [...connectedServices, ...connectedActions].some((entry) => entry.server_available || entry.server_count > 0) || left.serverAvailable || normalizedRight.serverAvailable || null,
    source: sources[0],
    sources,
    status: {
      registry_or_package: left.status,
      graph: normalizedRight.status,
      sources,
    },
    graphConflicts,
    topicStates,
  }
}

function finalizeMergedWorkspaceItem(item, topics = []) {
  const graphNames = item.kind === 'service'
    ? uniqueStrings((item.connectedServices ?? []).map((entry) => entry.service_name).filter(Boolean))
    : item.kind === 'action'
    ? uniqueStrings((item.connectedActions ?? []).map((entry) => entry.action_name).filter(Boolean))
    : []
  const connectedTopics = item.kind === 'message'
    ? topics.filter((topic) => topicHasType(topic, item.fullType))
    : item.connectedTopics ?? []
  const title = graphNames.length === 1
    ? graphNames[0]
    : graphNames.length > 1
    ? item.fullType
    : item.title
  return {
    ...item,
    connectedTopics,
    graphOnly: item.sources?.length === 1 && item.sources[0] === 'graph',
    id: `${item.kind}:${item.fullType}`,
    serverAvailable: item.serverAvailable ?? null,
    source: item.sources?.[0] ?? item.source,
    stableKey: `${item.kind}:${item.fullType}`,
    subtitle: item.kind === 'message'
      ? `${item.fullType}${connectedTopics.length ? ` · topics ${connectedTopics.length}` : ''}`
      : item.fullType,
    title,
  }
}

function registryItem(item, kind, {
  actionsByType = {},
  callable = null,
  history = [],
  messagesByType = {},
  receiveTopics = [],
  servicesByType = {},
  topics = [],
  topicPublishHistory = [],
  topicReceiveHistory = [],
} = {}) {
  const build = item.build ?? {}
  const fullType = callable?.service_type ?? callable?.action_type ?? registryFullType(item, kind)
  const messageState = kind === 'message' ? messagesByType[fullType] : null
  const connectedServices = servicesByType[fullType] ?? []
  const connectedActions = actionsByType[fullType] ?? []
  const topicHistory = kind === 'message'
    ? topicHistoryForType(topicPublishHistory, topicReceiveHistory, fullType)
    : []
  const filteredHistory = kind === 'message'
    ? topicHistory
    : filterHistoryByType(history, fullType, kind)
  return {
    callable: callable?.callable ?? null,
    error: build.error ?? item.parsed_error ?? callable?.reason ?? null,
    connectedActions,
    connectedServices,
    connectedTopics: kind === 'message'
      ? topics.filter((topic) => topicHasType(topic, fullType))
      : actionTopics(fullType, connectedActions, topics),
    fullType,
    history: filteredHistory,
    id: `single:${kind}:${item.file_name}`,
    importAvailable: messageState?.import_available ?? build.import_available ?? null,
    kind,
    lastRun: filteredHistory?.[0] ?? null,
    packageName: build.package_name ?? packageFromType(fullType),
    parsed: item.parsed,
    raw_text: item.raw_text,
    reason: callable?.reason,
    rebuildRequired: Boolean(build.rebuild_required),
    schema: kind === 'message'
      ? messageState?.message_schema ?? item.parsed ?? []
      : callable?.request_schema ?? callable?.goal_schema,
    serverAvailable: callable?.server_available ?? null,
    source: item.source ?? 'single_upload',
    stableKey: `${kind}:${fullType}`,
    status: build,
    subtitle: fullType,
    title: item.file_name,
    graphConflicts: messageState?.graph_conflicts ?? [],
    qos: { depth: 10, profile: 'default' },
    topicStates: kind === 'message'
      ? receiveTopics.filter((state) => state.topic_type === fullType)
      : [],
  }
}

function packageItems(item, context) {
  const counts = {
    action: item.interfaces?.action?.length ?? 0,
    message: item.interfaces?.msg?.length ?? 0,
    service: item.interfaces?.srv?.length ?? 0,
  }
  const packageItem = {
    callable: null,
    error: item.import_error ?? null,
    fullType: item.name,
    history: [],
    id: `package:${item.name}`,
    importAvailable: item.import_available ?? null,
    kind: 'package',
    lastRun: null,
    packageName: item.name,
    parsed: item.interfaces,
    raw_text: `${item.package_xml_summary ?? ''}\n${item.cmake_summary ?? ''}`.trim(),
    reason: null,
    rebuildRequired: Boolean(item.rebuild_required),
    schema: counts,
    serverAvailable: null,
    source: 'uploaded_package',
    stableKey: `package:${item.name}`,
    status: item,
    counts,
    subtitle: item.path ?? '-',
    title: item.name,
  }
  const childItems = [
    ...(item.interfaces?.msg ?? []).map((child) => packageTypeItem(item, child, 'message', context)),
    ...(item.interfaces?.srv ?? []).map((child) => packageTypeItem(item, child, 'service', context)),
    ...(item.interfaces?.action ?? []).map((child) => packageTypeItem(item, child, 'action', context)),
  ]
  return [packageItem, ...childItems]
}

function packageTypeItem(packageItem, item, kind, {
  actionsByType = {},
  actionHistory = [],
  servicesByType = {},
  serviceHistory = [],
  messagesByType = {},
  receiveTopics = [],
  topicPublishHistory = [],
  topicReceiveHistory = [],
  topics = [],
} = {}) {
  const connectedServices = servicesByType[item.type] ?? []
  const connectedActions = actionsByType[item.type] ?? []
  const parsed = item.parsed ?? {}
  const schema = kind === 'service'
    ? parsed.request ?? []
    : kind === 'action'
    ? parsed.goal ?? []
    : Array.isArray(parsed) ? parsed : parsed.fields ?? []
  const history = kind === 'service'
    ? filterHistoryByType(serviceHistory, item.type, kind)
    : kind === 'action'
    ? filterHistoryByType(actionHistory, item.type, kind)
    : topicHistoryForType(topicPublishHistory, topicReceiveHistory, item.type)
  const messageState = kind === 'message' ? messagesByType[item.type] : null
  return {
    callable: [...connectedServices, ...connectedActions].some((entry) => entry.callable) || null,
    connectedActions,
    connectedServices,
    connectedTopics: kind === 'message'
      ? topics.filter((topic) => topicHasType(topic, item.type))
      : actionTopics(item.type, connectedActions, topics),
    error: item.import_error ?? item.parsed_error ?? null,
    fullType: item.type,
    history,
    id: `package:${packageItem.name}:${kind}:${item.type}`,
    importAvailable: messageState?.import_available ?? item.import_available ?? null,
    kind,
    lastRun: history[0] ?? null,
    packageName: packageItem.name,
    parsed: item.parsed,
    raw_text: item.raw_text ?? '',
    reason: null,
    rebuildRequired: Boolean(packageItem.rebuild_required),
    schema: kind === 'message' ? messageState?.message_schema ?? schema : schema,
    serverAvailable: [...connectedServices, ...connectedActions].some((entry) => entry.server_available) || null,
    source: 'uploaded_package',
    stableKey: `${kind}:${item.type}`,
    status: item,
    subtitle: item.type,
    title: item.name ?? item.type,
    graphConflicts: messageState?.graph_conflicts ?? [],
    qos: { depth: 10, profile: 'default' },
    topicStates: kind === 'message'
      ? receiveTopics.filter((state) => state.topic_type === item.type)
      : [],
  }
}

function callableServiceItem(item, history) {
  const filteredHistory = history.filter((call) =>
    call.service_name === item.service_name && call.service_type === item.service_type,
  )
  return {
    callable: Boolean(item.callable),
    error: item.reason && !item.callable ? item.reason : null,
    fullType: item.service_type,
    connectedServices: [item],
    connectedActions: [],
    connectedTopics: [],
    history: filteredHistory,
    id: `graph:service:${item.service_name}:${item.service_type}`,
    importAvailable: item.import_available ?? null,
    kind: 'callable_service',
    lastRun: filteredHistory[0] ?? null,
    packageName: packageFromType(item.service_type),
    parsed: { request: item.request_schema, response: item.response_schema },
    raw_text: '',
    reason: item.reason,
    rebuildRequired: false,
    schema: item.request_schema,
    serverAvailable: item.server_available ?? null,
    source: 'graph',
    stableKey: `callable_service:${item.service_name}:${item.service_type}`,
    status: item,
    subtitle: item.service_type,
    title: item.service_name || item.file_name,
  }
}

function callableActionItem(item, history, _actionsByType, topics = []) {
  const filteredHistory = history.filter((goal) =>
    goal.action_name === item.action_name && goal.action_type === item.action_type,
  )
  return {
    callable: Boolean(item.callable),
    error: item.reason && !item.callable ? item.reason : null,
    fullType: item.action_type,
    connectedActions: [item],
    connectedServices: [],
    connectedTopics: actionTopics(item.action_type, [item], topics),
    history: filteredHistory,
    id: `graph:action:${item.action_name}:${item.action_type}`,
    importAvailable: item.import_available ?? null,
    kind: 'callable_action',
    lastRun: filteredHistory[0] ?? null,
    packageName: packageFromType(item.action_type),
    parsed: { goal: item.goal_schema, feedback: item.feedback_schema, result: item.result_schema },
    raw_text: '',
    reason: item.reason,
    rebuildRequired: false,
    schema: item.goal_schema,
    serverAvailable: item.server_available ?? null,
    source: 'graph',
    stableKey: `callable_action:${item.action_name}:${item.action_type}`,
    status: item,
    subtitle: item.action_type,
    title: item.action_name || item.file_name,
  }
}

function RequestField({ field, onChange, value }) {
  if (!field?.name) return null
  const type = field.type ?? ''
  if (type === 'bool' || type === 'boolean') {
    return (
      <label className="interface-service-field inline">
        <input
          checked={Boolean(value)}
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
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value || 'null'))
            } catch {
              onChange(event.target.value)
            }
          }}
          rows={isArrayType(type) ? 4 : 3}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? defaultValue(type), null, 2)}
        />
      </label>
    )
  }
  const numeric = isNumericType(type)
  return (
    <label className="interface-service-field">
      <span>{field.name} <small>{type}</small></span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type={numeric ? 'number' : 'text'}
        value={value ?? ''}
      />
    </label>
  )
}

function defaultValues(schema = []) {
  return Object.fromEntries(
    schemaFields(schema)
      .filter((field) => field.name)
      .map((field) => [field.name, defaultValue(field.type)]),
  )
}

function normalizeNumericValues(values, schema = []) {
  const numericFields = new Set(
    schemaFields(schema)
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

function schemaFields(schema) {
  return Array.isArray(schema) ? schema : []
}

function defaultValue(type = '') {
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

function groupByType(items, key) {
  return items.reduce((grouped, item) => {
    const type = item[key]
    if (!type) return grouped
    grouped[type] = [...(grouped[type] ?? []), item]
    return grouped
  }, {})
}

function normalizeWorkspaceKind(kind) {
  if (kind === 'callable_service') return 'service'
  if (kind === 'callable_action') return 'action'
  return kind
}

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)))
}

function firstType(value) {
  if (Array.isArray(value)) return value[0]
  return value
}

function mergeByNameAndType(items = [], nameKey, typeKey) {
  const byKey = new Map()
  items.forEach((item) => {
    const key = `${item?.[nameKey] ?? ''}|${item?.[typeKey] ?? ''}`
    if (!item || key === '|') return
    byKey.set(key, { ...(byKey.get(key) ?? {}), ...item })
  })
  return Array.from(byKey.values())
}

function mergeHistory(items = []) {
  const byKey = new Map()
  items.forEach((item, index) => {
    const key = [
      item.called_at ?? item.sent_at ?? item.published_at ?? item.received_at ?? item.id ?? index,
      item.service_name ?? item.action_name ?? item.topic_name ?? '',
      item.service_type ?? item.action_type ?? item.topic_type ?? '',
      item.direction ?? '',
    ].join(':')
    byKey.set(key, item)
  })
  return Array.from(byKey.values()).sort((a, b) =>
    (b.called_at ?? b.sent_at ?? b.published_at ?? b.received_at ?? 0)
      - (a.called_at ?? a.sent_at ?? a.published_at ?? a.received_at ?? 0),
  )
}

function hasMeaningfulParsed(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function registryFullType(item, kind) {
  const build = item.build ?? {}
  const packageName = build.package_name ?? build.interface_package
  if (packageName && item.type_name) {
    if (kind === 'service') return `${packageName}/srv/${item.type_name}`
    if (kind === 'action') return `${packageName}/action/${item.type_name}`
    return `${packageName}/msg/${item.type_name}`
  }
  return item.type_name
}

function filterHistoryByType(history, fullType, kind) {
  if (kind === 'service') {
    return history.filter((item) => item.service_type === fullType)
  }
  if (kind === 'action') {
    return history.filter((item) => item.action_type === fullType)
  }
  return []
}

function topicHistoryForType(publishHistory = [], receiveHistory = [], fullType) {
  const publishItems = publishHistory
    .filter((item) => item.topic_type === fullType)
    .map((item) => ({ ...item, direction: item.direction ?? 'topic_publish' }))
  const receiveItems = receiveHistory
    .filter((item) => item.topic_type === fullType)
    .map((item) => ({ ...item, direction: item.direction ?? 'topic_subscribe' }))
  return mergeHistory([...publishItems, ...receiveItems])
}

function actionTopics(fullType, connectedActions = [], topics = []) {
  if (!fullType?.includes('/action/')) return []
  const actionNames = connectedActions
    .map((item) => item.action_name)
    .filter(Boolean)
  return topics.filter((topic) =>
    actionNames.some((name) =>
      topic.name === `${name}/_action/feedback` || topic.name === `${name}/_action/status`,
    ),
  )
}

function historyKey(item, type) {
  if (type === 'topic') {
    return `${item.direction}-${item.published_at ?? item.received_at}-${item.topic_name}-${item.topic_type}-${item.error_type ?? ''}`
  }
  return type === 'service'
    ? `${item.called_at}-${item.service_name}-${item.service_type}-${item.error_type ?? ''}`
    : `${item.sent_at}-${item.action_name}-${item.action_type}-${item.error_type ?? ''}`
}

function historyLabel(item, type) {
  const timestamp = type === 'service'
    ? item.called_at
    : type === 'topic'
    ? item.published_at ?? item.received_at
    : item.sent_at
  const status = historyStatus(item)
  const elapsed = Math.round(item.elapsed_ms ?? 0)
  if (type === 'topic') {
    const direction = item.direction === 'topic_subscribe' ? 'subscribe' : 'publish'
    const sent = item.sent_to_topic === false ? 'sent_to_topic=false' : item.published ? 'sent_to_topic=true' : ''
    return `${formatTime(timestamp)} · ${direction} · ${status}${sent ? ` · ${sent}` : ''}`
  }
  const sent = item.sent_to_server === false ? 'sent_to_server=false' : 'sent_to_server=true'
  return `${formatTime(timestamp)} · ${status} · ${elapsed}ms · ${sent}`
}

function historyStatus(item) {
  if (item.success) return 'success'
  if (item.error_type) return item.error_type
  if (item.accepted === false) return 'rejected'
  if (item.error) return 'failed'
  if (item.direction === 'topic_subscribe') return 'received'
  if (item.published) return 'published'
  return 'unknown'
}

function formatTime(timestamp) {
  if (!timestamp) return '-'
  const millis = timestamp > 1000000000000 ? timestamp : timestamp * 1000
  return new Date(millis).toLocaleTimeString()
}

function matchesWorkspaceFilter(item, filter) {
  if (filter === 'all') return true
  if (filter === 'messages') return item.kind === 'message'
  if (filter === 'services') return item.kind === 'service'
  if (filter === 'actions') return item.kind === 'action'
  if (filter === 'packages') return item.kind === 'package'
  if (filter === 'callable_services') return item.kind === 'service' && item.callable
  if (filter === 'callable_actions') return item.kind === 'action' && item.callable
  if (filter === 'importable') return item.importAvailable
  if (filter === 'rebuild_required') return item.rebuildRequired
  if (filter === 'errors') return Boolean(item.error)
  return true
}

function relatedWorkspaceItems(item, items) {
  if (!item) return []
  if (item.kind === 'package') {
    return items.filter((candidate) =>
      candidate.packageName === item.packageName
      && ['service', 'action', 'callable_service', 'callable_action'].includes(candidate.kind)
      && candidate.id !== item.id,
    )
  }
  if (item.kind === 'service' || item.kind === 'callable_service') {
    return items.filter((candidate) =>
      candidate.fullType === item.fullType
      && ['service', 'callable_service'].includes(candidate.kind)
      && candidate.id !== item.id,
    )
  }
  if (item.kind === 'action' || item.kind === 'callable_action') {
    return items.filter((candidate) =>
      candidate.fullType === item.fullType
      && ['action', 'callable_action'].includes(candidate.kind)
      && candidate.id !== item.id,
    )
  }
  return []
}

function packageFromType(type = '') {
  return type.split('/')[0] || null
}

function sourceLabel(source) {
  if (source === 'single_upload') return '파일 등록'
  if (source === 'manual_type') return '타입 직접 등록'
  if (source === 'manual_definition') return '인터페이스 직접 작성'
  if (source === 'uploaded_package') return 'package 등록'
  if (source === 'graph') return 'graph'
  return source
}
