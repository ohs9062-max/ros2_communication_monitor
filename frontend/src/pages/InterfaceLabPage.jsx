import { Fragment, useEffect, useMemo, useState } from 'react'
import { InterfaceUploadControl } from '../components/InterfaceUploadControl.jsx'
import {
  callRegisteredService,
  fetchCallableActions,
  fetchCallableServices,
  fetchActions,
  fetchTopics,
  fetchInterfaceApplyStatus,
  fetchInterfacePackages,
  fetchInterfaceRegistry,
  fetchServices,
  fetchActionGoalHistory,
  fetchServiceCallHistory,
  sendActionGoal,
} from '../api/rosApi.js'

const GROUPS = [
  { id: 'all', label: '전체' },
  { id: 'messages', label: 'Message' },
  { id: 'services', label: 'Service' },
  { id: 'actions', label: 'Action' },
  { id: 'packages', label: 'Package' },
  { id: 'callable_services', label: '실행 가능 Service' },
  { id: 'callable_actions', label: '실행 가능 Action' },
  { id: 'importable', label: 'import 가능' },
  { id: 'rebuild_required', label: 'build 필요' },
  { id: 'errors', label: '오류' },
]

export function InterfaceLabPage({ websocket }) {
  const [registry, setRegistry] = useState({ messages: [], services: [], actions: [] })
  const [applyStatus, setApplyStatus] = useState(null)
  const [callableServices, setCallableServices] = useState([])
  const [callableActions, setCallableActions] = useState([])
  const [graphServices, setGraphServices] = useState([])
  const [graphActions, setGraphActions] = useState([])
  const [packages, setPackages] = useState([])
  const [serviceHistory, setServiceHistory] = useState([])
  const [actionHistory, setActionHistory] = useState([])
  const [topics, setTopics] = useState([])
  const [activeGroup, setActiveGroup] = useState('all')
  const [selected, setSelected] = useState(null)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  const [requestValues, setRequestValues] = useState({})
  const [goalValues, setGoalValues] = useState({})
  const [timeoutSec, setTimeoutSec] = useState(2)
  const [goalTimeoutSec, setGoalTimeoutSec] = useState(10)
  const [executing, setExecuting] = useState(false)
  const [inlineResult, setInlineResult] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [refreshSignal, setRefreshSignal] = useState(0)

  const refresh = async ({ notifyWorkbench = true } = {}) => {
    setRefreshing(true)
    try {
      const [
        registryPayload,
        statusPayload,
        servicesPayload,
        actionsPayload,
        packagesPayload,
        serviceHistoryPayload,
        actionHistoryPayload,
        topicsPayload,
        graphServicesPayload,
        graphActionsPayload,
      ] = await Promise.all([
        fetchInterfaceRegistry(),
        fetchInterfaceApplyStatus(),
        fetchCallableServices(),
        fetchCallableActions(),
        fetchInterfacePackages(),
        fetchServiceCallHistory(),
        fetchActionGoalHistory(),
        fetchTopics(),
        fetchServices({ includeHidden: true }),
        fetchActions(),
      ])
      setRegistry(registryPayload.data ?? { messages: [], services: [], actions: [] })
      setApplyStatus(statusPayload.data ?? null)
      setCallableServices(servicesPayload.data ?? [])
      setCallableActions(actionsPayload.data ?? [])
      setPackages(packagesPayload.data ?? [])
      setServiceHistory(serviceHistoryPayload.data ?? [])
      setActionHistory(actionHistoryPayload.data ?? [])
      setTopics(topicsPayload.data?.topics ?? topicsPayload.data ?? [])
      setGraphServices(graphServicesPayload.data?.services ?? graphServicesPayload.data ?? [])
      setGraphActions(graphActionsPayload.data?.actions ?? graphActionsPayload.data ?? [])
      setLastRefreshedAt(new Date())
      setError(null)
      if (notifyWorkbench) {
        setRefreshSignal((value) => value + 1)
      }
    } catch (nextError) {
      setError(nextError)
    } finally {
      setRefreshing(false)
    }
  }

  const handleWorkbenchStateChanged = () => {
    refresh({ notifyWorkbench: false })
  }

  useEffect(() => {
    refresh()
  }, [])

  const summary = useMemo(() => buildSummary({
    registry,
    callableActions,
    callableServices,
    graphActions,
    graphServices,
    packages,
  }), [registry, callableActions, callableServices, graphActions, graphServices, packages])
  const workspaceItems = useMemo(() => buildWorkspaceItems({
    actionHistory,
    callableActions,
    callableServices,
    filter: activeGroup,
    graphActions,
    graphServices,
    packages,
    registry,
    serviceHistory,
    topics,
  }), [actionHistory, activeGroup, callableActions, callableServices, graphActions, graphServices, packages, registry, serviceHistory, topics])
  const selectedDetail = workspaceItems.find((item) => item.id === selected?.id)
    ?? workspaceItems.find((item) => item.stableKey === selected?.stableKey)
    ?? null
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
    }
  }, [selectedDetail?.kind, selectedDetail?.schema, selectedDetail?.stableKey])

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
        request: requestValues,
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
        goal: goalValues,
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

  return (
    <main className="interface-lab-page">
      <section className="interface-lab-hero">
        <div>
          <p className="eyebrow">Interface Lab</p>
          <h2>타입 등록, 빌드 적용, Service/Action 테스트</h2>
          <p>
            타입 등록은 “사용자가 이 타입을 쓰겠다”는 선언입니다.
            이미 설치/import 가능하고 Graph에 서버가 있는 타입만 실행 후보가 됩니다.
            Service request와 Action Goal은 사용자가 버튼을 누를 때만 전송됩니다.
          </p>
          <p className="interface-lab-note">
            단일 타입 등록만으로 없는 package, CMakeLists.txt, package.xml, 의존 msg 파일을 자동 생성하거나
            colcon build 성공을 보장하지 않습니다. 패키지 전체가 필요하면 Package zip/폴더 업로드를 사용하세요.
          </p>
        </div>
        <div className="interface-lab-actions">
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
        <SummaryCard label="Service" value={summary.services} />
        <SummaryCard label="Action" value={summary.actions} />
        <SummaryCard label="import 가능" value={summary.importable} />
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
          <span className={applyStatus?.real_apply_success ? 'status-pill success' : 'status-pill warning'}>
            {applyStatus?.status ?? 'idle'}
          </span>
        </div>
        <InterfaceUploadControl
          onStateChanged={handleWorkbenchStateChanged}
          refreshSignal={refreshSignal}
          websocket={websocket}
        />
        {error && <p className="interface-lab-error">{error.message}</p>}
      </section>

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
                    onRelatedSelect={(nextItem) => {
                      setSelected(nextItem)
                      setSelectedHistoryItem(null)
                    }}
                    onRequestChange={setRequestValues}
                    onServiceExecute={executeSelectedService}
                    relatedItems={relatedItems}
                    requestValues={requestValues}
                    selectedHistoryItem={selectedHistoryItem}
                    setGoalTimeoutSec={setGoalTimeoutSec}
                    setTimeoutSec={setTimeoutSec}
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
          <Badge label={item.importAvailable ? 'import 가능' : 'import 대기/실패'} tone={item.importAvailable ? 'green' : 'yellow'} />
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
  onRelatedSelect,
  onRequestChange,
  onServiceExecute,
  relatedItems,
  requestValues,
  selectedHistoryItem,
  setGoalTimeoutSec,
  setTimeoutSec,
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
          onRequestChange={onRequestChange}
          onServiceExecute={onServiceExecute}
          requestValues={requestValues}
          selectedHistoryItem={selectedHistoryItem}
          setGoalTimeoutSec={setGoalTimeoutSec}
          setTimeoutSec={setTimeoutSec}
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
  onRequestChange,
  onServiceExecute,
  requestValues,
  selectedHistoryItem,
  setGoalTimeoutSec,
  setTimeoutSec,
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
        <dd>{item.importAvailable === null ? '-' : item.importAvailable ? 'import 가능' : 'import 실패/대기'}</dd>
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
        <p className="muted">import 가능하고 서버가 있는 Service가 있을 때 실행 폼이 활성화됩니다.</p>
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
        render={(action) => `${action.action_name || '서버 없음'} · servers ${action.server_count ?? 0} · ${action.callable ? '실행 가능' : action.reason ?? '실행 불가'}`}
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
        <p className="muted">import 가능하고 서버가 있는 Action이 있을 때 Goal 폼이 활성화됩니다.</p>
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

function buildSummary({ callableActions, callableServices, packages, registry }) {
  const items = [
    ...(registry.messages ?? []),
    ...(registry.services ?? []),
    ...(registry.actions ?? []),
  ]
  return {
    actions: registry.actions?.length ?? 0,
    callableActions: callableActions.filter((item) => item.callable).length,
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
  callableServices,
  filter,
  graphActions = [],
  graphServices = [],
  packages,
  registry,
  serviceHistory,
  topics,
}) {
  const graphServiceEntries = mergeGraphServiceEntries(graphServices, callableServices)
  const graphActionEntries = mergeGraphActionEntries(graphActions, callableActions)
  const servicesByType = groupByType(graphServiceEntries, 'service_type')
  const actionsByType = groupByType(graphActionEntries, 'action_type')
  const items = [
    ...(registry.messages ?? []).map((item) => registryItem(item, 'message', {
      actionsByType,
      actionHistory,
      servicesByType,
      serviceHistory,
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
  }
}

function finalizeMergedWorkspaceItem(item, topics = []) {
  const graphNames = item.kind === 'service'
    ? uniqueStrings((item.connectedServices ?? []).map((entry) => entry.service_name).filter(Boolean))
    : item.kind === 'action'
    ? uniqueStrings((item.connectedActions ?? []).map((entry) => entry.action_name).filter(Boolean))
    : []
  const connectedTopics = item.kind === 'message'
    ? topics.filter((topic) => firstType(topic.type ?? topic.types) === item.fullType)
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
  servicesByType = {},
  topics = [],
} = {}) {
  const build = item.build ?? {}
  const fullType = callable?.service_type ?? callable?.action_type ?? registryFullType(item, kind)
  const connectedServices = servicesByType[fullType] ?? []
  const connectedActions = actionsByType[fullType] ?? []
  const filteredHistory = filterHistoryByType(history, fullType, kind)
  return {
    callable: callable?.callable ?? null,
    error: build.error ?? item.parsed_error ?? callable?.reason ?? null,
    connectedActions,
    connectedServices,
    connectedTopics: actionTopics(fullType, connectedActions, topics),
    fullType,
    history: filteredHistory,
    id: `single:${kind}:${item.file_name}`,
    importAvailable: build.import_available ?? null,
    kind,
    lastRun: filteredHistory?.[0] ?? null,
    packageName: build.package_name ?? packageFromType(fullType),
    parsed: item.parsed,
    raw_text: item.raw_text,
    reason: callable?.reason,
    rebuildRequired: Boolean(build.rebuild_required),
    schema: callable?.request_schema ?? callable?.goal_schema,
    serverAvailable: callable?.server_available ?? null,
    source: item.source ?? 'single_upload',
    stableKey: `${kind}:${fullType}`,
    status: build,
    subtitle: fullType,
    title: item.file_name,
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
  topics = [],
} = {}) {
  const connectedServices = servicesByType[item.type] ?? []
  const connectedActions = actionsByType[item.type] ?? []
  const parsed = item.parsed ?? {}
  const schema = kind === 'service'
    ? parsed.request ?? []
    : kind === 'action'
    ? parsed.goal ?? []
    : parsed.fields ?? []
  const history = kind === 'service'
    ? filterHistoryByType(serviceHistory, item.type, kind)
    : kind === 'action'
    ? filterHistoryByType(actionHistory, item.type, kind)
    : []
  return {
    callable: [...connectedServices, ...connectedActions].some((entry) => entry.callable) || null,
    connectedActions,
    connectedServices,
    connectedTopics: actionTopics(item.type, connectedActions, topics),
    error: item.import_error ?? item.parsed_error ?? null,
    fullType: item.type,
    history,
    id: `package:${packageItem.name}:${kind}:${item.type}`,
    importAvailable: item.import_available ?? null,
    kind,
    lastRun: history[0] ?? null,
    packageName: packageItem.name,
    parsed: item.parsed,
    raw_text: item.raw_text ?? '',
    reason: null,
    rebuildRequired: Boolean(packageItem.rebuild_required),
    schema,
    serverAvailable: [...connectedServices, ...connectedActions].some((entry) => entry.server_available) || null,
    source: 'uploaded_package',
    stableKey: `${kind}:${item.type}`,
    status: item,
    subtitle: item.type,
    title: item.name ?? item.type,
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
        onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
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
    const key = `${item.called_at ?? item.sent_at ?? item.id ?? index}:${item.service_name ?? item.action_name ?? ''}`
    byKey.set(key, item)
  })
  return Array.from(byKey.values()).sort((a, b) =>
    (b.called_at ?? b.sent_at ?? 0) - (a.called_at ?? a.sent_at ?? 0),
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
  return type === 'service'
    ? `${item.called_at}-${item.service_name}-${item.service_type}-${item.error_type ?? ''}`
    : `${item.sent_at}-${item.action_name}-${item.action_type}-${item.error_type ?? ''}`
}

function historyLabel(item, type) {
  const timestamp = type === 'service' ? item.called_at : item.sent_at
  const status = historyStatus(item)
  const elapsed = Math.round(item.elapsed_ms ?? 0)
  const sent = item.sent_to_server === false ? 'sent_to_server=false' : 'sent_to_server=true'
  return `${formatTime(timestamp)} · ${status} · ${elapsed}ms · ${sent}`
}

function historyStatus(item) {
  if (item.success) return 'success'
  if (item.error_type) return item.error_type
  if (item.accepted === false) return 'rejected'
  return item.error ? 'failed' : 'unknown'
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
