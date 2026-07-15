import { useEffect, useMemo, useState } from 'react'
import { InterfaceUploadControl } from '../components/InterfaceUploadControl.jsx'
import {
  fetchCallableActions,
  fetchCallableServices,
  fetchInterfaceApplyStatus,
  fetchInterfaceRegistry,
  fetchActionGoalHistory,
  fetchServiceCallHistory,
} from '../api/rosApi.js'

const GROUPS = [
  { id: 'messages', label: 'Message' },
  { id: 'services', label: 'Service' },
  { id: 'actions', label: 'Action' },
]

export function InterfaceLabPage({ websocket }) {
  const [registry, setRegistry] = useState({ messages: [], services: [], actions: [] })
  const [applyStatus, setApplyStatus] = useState(null)
  const [callableServices, setCallableServices] = useState([])
  const [callableActions, setCallableActions] = useState([])
  const [serviceHistory, setServiceHistory] = useState([])
  const [actionHistory, setActionHistory] = useState([])
  const [activeGroup, setActiveGroup] = useState('services')
  const [selected, setSelected] = useState(null)
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
        serviceHistoryPayload,
        actionHistoryPayload,
      ] = await Promise.all([
        fetchInterfaceRegistry(),
        fetchInterfaceApplyStatus(),
        fetchCallableServices(),
        fetchCallableActions(),
        fetchServiceCallHistory(),
        fetchActionGoalHistory(),
      ])
      setRegistry(registryPayload.data ?? { messages: [], services: [], actions: [] })
      setApplyStatus(statusPayload.data ?? null)
      setCallableServices(servicesPayload.data ?? [])
      setCallableActions(actionsPayload.data ?? [])
      setServiceHistory(serviceHistoryPayload.data ?? [])
      setActionHistory(actionHistoryPayload.data ?? [])
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
  }), [registry, callableActions, callableServices])
  const selectedDetail = selected ?? firstItem(registry, activeGroup)

  return (
    <main className="interface-lab-page">
      <section className="interface-lab-hero">
        <div>
          <p className="eyebrow">Interface Lab</p>
          <h2>타입 등록, 빌드 적용, Service/Action 테스트</h2>
          <p>
            Allowlist에 등록되고 import 가능한 인터페이스만 실행 후보가 됩니다.
            Service request와 Action Goal은 사용자가 버튼을 누를 때만 전송됩니다.
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
          <div className="interface-card-list">
            {(registry[activeGroup] ?? []).map((item) => (
              <InterfaceCard
                callable={callableInfo(item, activeGroup, callableServices, callableActions)}
                item={item}
                key={item.file_name}
                onClick={() => setSelected(item)}
                selected={selectedDetail?.file_name === item.file_name}
              />
            ))}
            {!(registry[activeGroup] ?? []).length && (
              <p className="muted">등록된 항목이 없습니다.</p>
            )}
          </div>
        </div>
        <InterfaceDetailPanel
          callable={callableInfo(selectedDetail, activeGroup, callableServices, callableActions)}
          history={activeGroup === 'services' ? serviceHistory : actionHistory}
          item={selectedDetail}
          kind={activeGroup}
        />
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

function InterfaceCard({ callable, item, onClick, selected }) {
  const build = item.build ?? {}
  return (
    <button className={selected ? 'interface-card selected' : 'interface-card'} onClick={onClick} type="button">
      <strong>{item.file_name}</strong>
      <span>{item.type_name}</span>
      <div className="interface-badge-row">
        <Badge label="Allowlist 등록됨" tone="blue" />
        <Badge label={build.file_saved ? '파일 생성됨' : '파일 미생성'} tone={build.file_saved ? 'green' : 'red'} />
        <Badge label={build.cmake_registered ? 'CMake 등록됨' : 'CMake 미등록'} tone={build.cmake_registered ? 'green' : 'red'} />
        <Badge label={build.rebuild_required ? 'build 필요' : '빌드 반영'} tone={build.rebuild_required ? 'yellow' : 'green'} />
        <Badge label={build.import_available ? 'import 가능' : 'import 불가'} tone={build.import_available ? 'green' : 'yellow'} />
        {callable && <Badge label={callable.callable ? '호출 가능' : callable.reason ?? '실행 불가'} tone={callable.callable ? 'green' : 'yellow'} />}
      </div>
    </button>
  )
}

function InterfaceDetailPanel({ callable, history, item, kind }) {
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
      <h3>{item.file_name}</h3>
      <dl>
        <dt>type_name</dt>
        <dd>{item.type_name}</dd>
        <dt>allowlist</dt>
        <dd>Allowlist 등록됨</dd>
        {callable && (
          <>
            <dt>{kind === 'services' ? 'service' : 'action'}</dt>
            <dd>{callable.service_name ?? callable.action_name ?? '서버 없음'}</dd>
            <dt>callable</dt>
            <dd>{callable.callable ? '호출 가능' : callable.reason ?? '실행 불가'}</dd>
          </>
        )}
      </dl>
      <CollapsibleJson title="build 상태" value={item.build ?? {}} />
      <CollapsibleJson title="parsed" value={item.parsed ?? {}} />
      <CollapsibleText title="raw_text" value={item.raw_text ?? ''} />
      {(kind === 'services' || kind === 'actions') && (
        <CollapsibleJson title="최근 실행" value={history?.[0] ?? {}} />
      )}
    </aside>
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

function buildSummary({ callableActions, callableServices, registry }) {
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
    rebuildRequired: items.filter((item) => item.build?.rebuild_required).length,
    services: registry.services?.length ?? 0,
  }
}

function callableInfo(item, group, services, actions) {
  if (!item) return null
  if (group === 'services') {
    return services.find((service) => service.file_name === item.file_name) ?? null
  }
  if (group === 'actions') {
    return actions.find((action) => action.file_name === item.file_name) ?? null
  }
  return null
}

function firstItem(registry, group) {
  return registry[group]?.[0] ?? null
}
