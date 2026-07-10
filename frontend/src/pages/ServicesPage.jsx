import { useEffect, useMemo, useState } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { ServiceDetailPanel } from '../components/ServiceDetailPanel.jsx'
import { ServiceSummaryCards } from '../components/ServiceSummaryCards.jsx'
import { ServiceTable } from '../components/ServiceTable.jsx'
import { matchesServiceStatusFilter } from '../utils/status.js'

const SERVICE_FILTERS = [
  { id: 'primary', label: '주요 항목' },
  { id: 'active_check', label: '응답 측정' },
  { id: 'issues', label: '대기/오류' },
  { id: 'all', label: '전체' },
  { id: 'internal', label: '내부/관리 포함' },
]

const CUSTOM_SERVICE_TYPE_PREFIXES = [
  'can_interfaces/srv/',
  'ros2_dashboard_interfaces/srv/',
  'rths_interfaces/srv/',
]

const CUSTOM_SERVICE_TYPES = new Set([
  'example_interfaces/srv/AddTwoInts',
])

const IMPORTANT_SERVICE_NAMES = new Set([
  '/add_two_ints',
  '/cmd_service',
  '/robot_cmd',
  '/RobotControl',
])

const ACTIVE_CHECK_STATUSES = new Set([
  'success',
  'failed',
  'timeout',
  'error',
])

const ISSUE_SERVICE_STATUSES = new Set([
  'waiting_server',
  'error',
  'failed',
  'timeout',
])

const LIFECYCLE_SERVICE_SUFFIXES = [
  '/change_state',
  '/get_available_states',
  '/get_available_transitions',
  '/get_state',
  '/get_transition_graph',
]

const COSTMAP_MANAGEMENT_MARKERS = [
  '/clear_around_',
  '/clear_except_',
  '/clear_entirely_',
  '/get_costmap',
  '/get_cost_',
  '/get_obstacle_layer',
  '/get_static_layer',
  '/get_voxel_layer',
]

const MANAGEMENT_SERVICE_MARKERS = [
  '/load_node',
  '/unload_node',
  '/load_map',
  '/reload_database',
]

export function ServicesPage({ dashboard }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('primary')
  const {
    alerts,
    error,
    includeHidden,
    loading,
    meta,
    selectedService,
    selectedServiceName,
    serviceAlerts,
    serviceParticipants,
    services,
    setIncludeHidden,
    setSelectedServiceName,
  } = dashboard

  const primaryServices = useMemo(
    () => services.filter((service) => isPrimaryService(service)),
    [services],
  )
  const summary = useMemo(
    () => getServiceUiSummary(services, primaryServices, meta),
    [meta, primaryServices, services],
  )

  const filteredServices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const baseServices = statusFilter === 'internal'
      ? services
      : statusFilter === 'primary'
        ? primaryServices
        : services.filter((service) => !isInternalOrManagementService(service))

    return baseServices.filter((service) => {
      const fields = [
        service.name,
        service.type,
        service.category,
        service.status,
        service.active_check?.last_status,
      ]
      const matchesSearch =
        !normalizedSearch ||
        fields.some((field) =>
          String(field ?? '').toLowerCase().includes(normalizedSearch),
        )

      return matchesSearch && matchesServiceFilter(service, statusFilter)
    })
  }, [primaryServices, search, services, statusFilter])

  useEffect(() => {
    setIncludeHidden(statusFilter === 'internal')
  }, [setIncludeHidden, statusFilter])

  useEffect(() => {
    if (filteredServices.some((service) => service.name === selectedServiceName)) {
      return
    }

    setSelectedServiceName(filteredServices[0]?.name ?? '')
  }, [filteredServices, selectedServiceName, setSelectedServiceName])

  const detailService = filteredServices.some(
    (service) => service.name === selectedServiceName,
  )
    ? selectedService
    : null
  const openServiceAlert = (alert) => {
    setIncludeHidden(true)
    setSearch('')
    setStatusFilter('all')
    setSelectedServiceName(alert.name)
    focusMonitorRow(alert.name, setSelectedServiceName)
  }

  return (
    <main className="topics-page">
      <section className="main-panel">
        <ServiceSummaryCards
          meta={meta}
          primaryServices={primaryServices}
          services={services}
          summary={summary}
        />
        <AlertsPreview
          alerts={serviceAlerts}
          emptyMessage="Service 알림 없음"
          error={alerts.error}
          onAlertClick={openServiceAlert}
          title="Service Alert"
        />

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <h2>Service 상세</h2>
              <p className="muted">
                기본 화면은 현재 활동 중이거나 사용자에게 필요한 Service만
                표시합니다. 기본 화면은 응답 측정 대상, custom service,
                대기/오류 상태처럼 사용자가 먼저 확인해야 하는 Service만
                표시합니다. 전체 목록은 '전체' 또는 '내부/관리 포함'에서
                확인할 수 있습니다.
              </p>
            </div>
            {loading && <span className="muted">로딩 중</span>}
            {error && <span className="error-text">Service API 연결 실패</span>}
          </div>

          <div className="filter-toolbar service-toolbar">
            <input
              aria-label="Service 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Service 이름, 타입, 상태 검색"
              type="search"
              value={search}
            />
            <div className="service-filter-actions">
              <div
                className="filter-buttons"
                role="group"
                aria-label="Service 상태 필터"
              >
                {SERVICE_FILTERS.map((filter) => (
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

          <ServiceTable
            emptyMessage={
              statusFilter === 'internal' || includeHidden
                ? '표시할 Service가 없습니다'
                : "현재 주요 Service가 없습니다. 전체 목록은 '전체' 또는 '내부/관리 포함' 탭에서 확인하세요."
            }
            onSelectService={setSelectedServiceName}
            selectedServiceName={selectedServiceName}
            services={filteredServices}
          />
        </section>
      </section>

      <ServiceDetailPanel
        participants={serviceParticipants[detailService?.name] ?? null}
        service={detailService}
      />
    </main>
  )
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

function isPrimaryService(service) {
  return (
    service.active_check_supported === true ||
    hasActiveCheckResult(service) ||
    hasResponseTime(service) ||
    isIssueService(service) ||
    isCustomService(service)
  )
}

function matchesServiceFilter(service, filter) {
  if (filter === 'primary') {
    return isPrimaryService(service)
  }
  if (filter === 'all' || filter === 'internal') {
    return true
  }
  if (filter === 'active_check') {
    return service.active_check_supported === true || hasActiveCheckResult(service)
  }
  if (filter === 'issues') {
    return isIssueService(service)
  }

  return matchesServiceStatusFilter(service, filter)
}

function getServiceUiSummary(services, primaryServices, meta) {
  const total =
    meta.count ??
    ((meta.visible_count ?? services.length) + (meta.hidden_count ?? 0))
  const hiddenNotFetched = services.length < total ? (meta.hidden_count ?? 0) : 0

  return {
    activeCheckCount: services.filter((service) =>
      service.active_check_supported === true || hasActiveCheckResult(service),
    ).length,
    internalManagementCount: services.filter(isInternalOrManagementService).length +
      hiddenNotFetched,
    issueCount: services.filter(isIssueService).length,
    primaryCount: primaryServices.length,
    statusOnlyCount: services.filter(
      (service) => service.active_check_supported === false,
    ).length,
    total,
  }
}

function isIssueService(service) {
  const status = String(service.status || 'unknown').toLowerCase()
  const activeCheckStatus = activeCheckStatusOf(service)
  return (
    ISSUE_SERVICE_STATUSES.has(status) ||
    ['failed', 'timeout', 'error', 'type_mismatch'].includes(activeCheckStatus)
  )
}

function hasActiveCheckResult(service) {
  return ACTIVE_CHECK_STATUSES.has(activeCheckStatusOf(service))
}

function hasResponseTime(service) {
  return service.active_check?.last_response_time_ms != null
}

function activeCheckStatusOf(service) {
  return String(service.active_check?.last_status ?? '').toLowerCase()
}

function isCustomService(service) {
  const type = String(service.type ?? '')
  const name = String(service.name ?? '')
  return (
    CUSTOM_SERVICE_TYPES.has(type) ||
    CUSTOM_SERVICE_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix)) ||
    IMPORTANT_SERVICE_NAMES.has(name)
  )
}

function isInternalOrManagementService(service) {
  const category = String(service.category ?? '')
  const name = String(service.name ?? '')
  const type = String(service.type ?? '')

  return (
    service.hidden_by_default === true ||
    category === 'parameter' ||
    category === 'ros_internal' ||
    category === 'action_internal' ||
    type.startsWith('lifecycle_msgs/srv/') ||
    type.startsWith('composition_interfaces/srv/') ||
    LIFECYCLE_SERVICE_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    name.includes('/_action/send_goal') ||
    name.includes('/_action/get_result') ||
    name.includes('/_action/cancel_goal') ||
    name.includes('/_container/') ||
    COSTMAP_MANAGEMENT_MARKERS.some((marker) => name.includes(marker)) ||
    name.includes('/lifecycle_manager_') ||
    name.endsWith('/manage_nodes') ||
    MANAGEMENT_SERVICE_MARKERS.some((marker) => name.includes(marker))
  )
}
