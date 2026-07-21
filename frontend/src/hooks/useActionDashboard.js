import { useEffect, useMemo, useState } from 'react'
import { fetchActions, fetchAlerts, fetchNodes } from '../api/rosApi.js'
import { buildParticipantMaps } from '../utils/participants.js'
import { usePolling } from './usePolling.js'

const ACTION_POLL_INTERVAL_MS = 3000
const ALERT_POLL_INTERVAL_MS = 3000

export function useActionDashboard({ enabled = true } = {}) {
  const [includeIdleActions, setIncludeIdleActions] = useState(false)
  const [selectedActionName, setSelectedActionName] = useState('')

  const actionsState = usePolling(fetchActions, ACTION_POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: { actions: [], meta: {} } },
  })
  const alertsState = usePolling(fetchAlerts, ALERT_POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: [], meta: {} },
  })
  const nodeState = usePolling(fetchNodes, ACTION_POLL_INTERVAL_MS, {
    enabled,
    initialData: { data: { nodes: [], meta: {} } },
  })

  const actions = useMemo(
    () => actionsState.data?.data?.actions ?? [],
    [actionsState.data],
  )
  const meta = actionsState.data?.data?.meta ?? {}
  const nodes = useMemo(
    () => nodeState.data?.data?.nodes ?? [],
    [nodeState.data],
  )
  const { actionParticipants } = useMemo(
    () => buildParticipantMaps(nodes),
    [nodes],
  )
  const actionAlerts = useMemo(
    () =>
      (alertsState.data?.data ?? []).filter(
        (alert) => alert.source === 'action',
      ),
    [alertsState.data],
  )
  const selectedAction = useMemo(
    () =>
      actions.find((action) => action.name === selectedActionName) ??
      null,
    [selectedActionName, actions],
  )

  useEffect(() => {
    if (selectedActionName && selectedAction) {
      return
    }

    setSelectedActionName(actions[0]?.name ?? '')
  }, [actions, selectedAction, selectedActionName])

  return {
    actionAlerts,
    actionParticipants,
    actions,
    alerts: alertsState,
    error: actionsState.error,
    includeIdleActions,
    loading: actionsState.loading,
    meta,
    refresh: actionsState.refresh,
    selectedAction,
    selectedActionName,
    setIncludeIdleActions,
    setSelectedActionName,
  }
}
