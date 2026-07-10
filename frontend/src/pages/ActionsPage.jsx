import { useEffect, useMemo, useState } from 'react'
import { ActionDetailPanel } from '../components/ActionDetailPanel.jsx'
import { ActionSummaryCards } from '../components/ActionSummaryCards.jsx'
import { ActionTable } from '../components/ActionTable.jsx'
import { AlertsPreview } from '../components/AlertsPreview.jsx'

const ACTION_FILTERS = [
  { id: 'primary', label: '주요 항목' },
  { id: 'all', label: '전체' },
  { id: 'running', label: '실행 중' },
  { id: 'succeeded', label: '성공' },
  { id: 'failed', label: '실패/취소' },
  { id: 'unobserved', label: 'Goal 미관찰' },
]

export function ActionsPage({ dashboard }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('primary')
  const {
    actionAlerts,
    actionParticipants,
    actions,
    alerts,
    error,
    includeIdleActions,
    loading,
    meta,
    selectedAction,
    selectedActionName,
    setIncludeIdleActions,
    setSelectedActionName,
  } = dashboard

  const activeActions = useMemo(
    () => actions.filter((action) => isActiveAction(action)),
    [actions],
  )

  const filteredActions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const baseActions =
      includeIdleActions ||
      statusFilter === 'all' ||
      statusFilter === 'unobserved'
      ? actions
      : activeActions

    return baseActions.filter((action) => {
      if (!matchesActionStatusFilter(action, statusFilter)) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const runtime = action.runtime ?? {}
      const fields = [
        action.name,
        action.type,
        action.status,
        action.reason,
        runtime.last_goal_status,
        runtime.result_status,
      ]
      return fields.some((field) =>
        String(field ?? '').toLowerCase().includes(normalizedSearch),
      )
    })
  }, [actions, activeActions, includeIdleActions, search, statusFilter])

  useEffect(() => {
    if (filteredActions.some((action) => action.name === selectedActionName)) {
      return
    }

    setSelectedActionName(filteredActions[0]?.name ?? '')
  }, [filteredActions, selectedActionName, setSelectedActionName])

  const detailAction = filteredActions.some(
    (action) => action.name === selectedActionName,
  )
    ? selectedAction
    : null
  const openActionAlert = (alert) => {
    setIncludeIdleActions(true)
    setSearch('')
    setStatusFilter('all')
    setSelectedActionName(alert.name)
    focusMonitorRow(alert.name, setSelectedActionName)
  }

  return (
    <main className="topics-page">
      <section className="main-panel">
        <ActionSummaryCards actions={actions} activeActions={activeActions} meta={meta} />
        <AlertsPreview
          alerts={actionAlerts}
          emptyMessage="Action 알림 없음"
          error={alerts.error}
          onAlertClick={openActionAlert}
          title="Action Alert"
        />

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <h2>Action 상세</h2>
              <p className="muted">
                Action 목록은 3초마다 갱신됩니다. Goal 전송과 cancel은
                제공하지 않습니다.
              </p>
            </div>
            {loading && <span className="muted">로딩 중</span>}
            {error && <span className="error-text">Action API 연결 실패</span>}
          </div>

          <div className="filter-toolbar">
            <input
              aria-label="Action 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Action 이름, 타입, 상태 검색"
              type="search"
              value={search}
            />
            <div className="service-filter-actions">
              <button
                className={includeIdleActions ? 'filter active' : 'filter'}
                onClick={() => setIncludeIdleActions(!includeIdleActions)}
                type="button"
              >
                대기 Action 포함
              </button>
              <div
                aria-label="Action 상태 필터"
                className="filter-buttons"
                role="group"
              >
                {ACTION_FILTERS.map((filter) => (
                  <button
                    className={
                      statusFilter === filter.id ? 'filter active' : 'filter'
                    }
                    key={filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ActionTable
            actions={filteredActions}
            emptyMessage={
              includeIdleActions
                ? '표시할 Action이 없습니다'
                : "현재 관찰된 Action Goal이 없습니다. 대기 Action을 보려면 '대기 Action 포함'을 켜세요."
            }
            onSelectAction={setSelectedActionName}
            selectedActionName={selectedActionName}
          />
        </section>
      </section>

      <ActionDetailPanel
        action={detailAction}
        participants={actionParticipants[detailAction?.name] ?? null}
      />
    </main>
  )
}

function isActiveAction(action) {
  const runtime = action.runtime ?? {}
  const observedGoalCount =
    Number(runtime.observed_goal_count ?? action.observed_goal_count ?? 0)
  const lastGoalStatus = String(
    runtime.last_goal_status ?? action.last_goal_status ?? '',
  ).toLowerCase()

  return (
    observedGoalCount > 0 ||
    Boolean(lastGoalStatus && lastGoalStatus !== 'unknown') ||
    Boolean(runtime.feedback_preview) ||
    Boolean(runtime.result_preview) ||
    Boolean(runtime.result_status) ||
    Boolean(runtime.result_error)
  )
}

function matchesActionStatusFilter(action, statusFilter) {
  if (statusFilter === 'primary' || statusFilter === 'all') {
    return true
  }

  const runtime = action.runtime ?? {}
  const lastGoalStatus = String(
    runtime.last_goal_status ?? action.last_goal_status ?? '',
  ).toLowerCase()
  const resultStatus = String(runtime.result_status ?? '').toLowerCase()

  if (statusFilter === 'running') {
    return ['accepted', 'executing', 'canceling'].includes(lastGoalStatus)
  }
  if (statusFilter === 'succeeded') {
    return lastGoalStatus === 'succeeded' || resultStatus === 'succeeded'
  }
  if (statusFilter === 'failed') {
    return (
      ['aborted', 'canceled'].includes(lastGoalStatus) ||
      ['aborted', 'canceled', 'error', 'timeout'].includes(resultStatus) ||
      Boolean(runtime.result_error)
    )
  }
  if (statusFilter === 'unobserved') {
    return (
      (runtime.observed_goal_count ?? 0) === 0 &&
      (!lastGoalStatus || lastGoalStatus === 'unknown')
    )
  }

  return true
}

function focusMonitorRow(name, select) {
  window.setTimeout(() => focusMonitorRowAttempt(name, select, 0), 50)
}

function focusMonitorRowAttempt(name, select, attempt) {
  select(name)
  const row = findMonitorRow(name)
  if (row) {
    row.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    return
  }

  if (attempt < 6) {
    window.setTimeout(() => focusMonitorRowAttempt(name, select, attempt + 1), 80)
  }
}

function findMonitorRow(name) {
  return [...document.querySelectorAll('[data-monitor-name]')].find(
    (row) => row.getAttribute('data-monitor-name') === name,
  )
}
