import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAlerts, fetchNodes, fetchServices } from '../api/rosApi.js'
import { buildParticipantMaps } from '../utils/participants.js'
import { usePolling } from './usePolling.js'

const SERVICE_POLL_INTERVAL_MS = 3000
const ALERT_POLL_INTERVAL_MS = 3000

export function useServiceDashboard() {
  const [includeHidden, setIncludeHidden] = useState(false)
  const [selectedServiceName, setSelectedServiceName] = useState('')

  const servicesFetcher = useCallback(
    () => fetchServices({ includeHidden }),
    [includeHidden],
  )
  const servicesState = usePolling(servicesFetcher, SERVICE_POLL_INTERVAL_MS, {
    initialData: { data: { services: [], meta: {} } },
  })
  const alertsState = usePolling(fetchAlerts, ALERT_POLL_INTERVAL_MS, {
    initialData: { data: [], meta: {} },
  })
  const nodeState = usePolling(fetchNodes, SERVICE_POLL_INTERVAL_MS, {
    initialData: { data: { nodes: [], meta: {} } },
  })

  const services = useMemo(
    () => servicesState.data?.data?.services ?? [],
    [servicesState.data],
  )
  const meta = servicesState.data?.data?.meta ?? {}
  const nodes = useMemo(
    () => nodeState.data?.data?.nodes ?? [],
    [nodeState.data],
  )
  const { serviceParticipants } = useMemo(
    () => buildParticipantMaps(nodes),
    [nodes],
  )
  const serviceAlerts = useMemo(
    () =>
      (alertsState.data?.data ?? []).filter(
        (alert) => alert.source === 'service',
      ),
    [alertsState.data],
  )
  const selectedService = useMemo(
    () =>
      services.find((service) => service.name === selectedServiceName) ??
      null,
    [selectedServiceName, services],
  )

  useEffect(() => {
    if (selectedServiceName && selectedService) {
      return
    }

    setSelectedServiceName(services[0]?.name ?? '')
  }, [selectedService, selectedServiceName, services])

  return {
    alerts: alertsState,
    error: servicesState.error,
    includeHidden,
    loading: servicesState.loading,
    meta,
    selectedService,
    selectedServiceName,
    serviceAlerts,
    serviceParticipants,
    services,
    setIncludeHidden,
    setSelectedServiceName,
  }
}
