import { useMemo, useState } from 'react'
import { ActionDetailPanel } from '../components/ActionDetailPanel.jsx'
import { ActionSummaryCards } from '../components/ActionSummaryCards.jsx'
import { ActionTable } from '../components/ActionTable.jsx'
import { AlertsPreview } from '../components/AlertsPreview.jsx'

export function ActionsPage({ dashboard }) {
  const [search, setSearch] = useState('')
  const {
    actionAlerts,
    actions,
    alerts,
    error,
    loading,
    meta,
    selectedAction,
    selectedActionName,
    setSelectedActionName,
  } = dashboard

  const filteredActions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) {
      return actions
    }

    return actions.filter((action) => {
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
  }, [actions, search])

  return (
    <main className="topics-page">
      <section className="main-panel">
        <ActionSummaryCards meta={meta} />
        <AlertsPreview
          alerts={actionAlerts}
          emptyMessage="Action 알림 없음"
          error={alerts.error}
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
          </div>

          <ActionTable
            actions={filteredActions}
            onSelectAction={setSelectedActionName}
            selectedActionName={selectedActionName}
          />
        </section>
      </section>

      <ActionDetailPanel action={selectedAction} />
    </main>
  )
}
