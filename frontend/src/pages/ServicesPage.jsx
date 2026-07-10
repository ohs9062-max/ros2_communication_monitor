import { useEffect, useMemo, useState } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { ServiceDetailPanel } from '../components/ServiceDetailPanel.jsx'
import { ServiceSummaryCards } from '../components/ServiceSummaryCards.jsx'
import { ServiceTable } from '../components/ServiceTable.jsx'
import { matchesServiceStatusFilter } from '../utils/status.js'

const SERVICE_FILTERS = [
  { id: 'all', label: '상태 전체' },
  { id: 'active', label: '정상' },
  { id: 'warning', label: '주의' },
  { id: 'error', label: '오류' },
  { id: 'unsupported', label: '미지원' },
]

export function ServicesPage({ dashboard }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const {
    alerts,
    error,
    includeHidden,
    loading,
    meta,
    selectedService,
    selectedServiceName,
    serviceAlerts,
    services,
    setIncludeHidden,
    setSelectedServiceName,
  } = dashboard

  const activeServices = useMemo(
    () => services.filter((service) => isActiveService(service)),
    [services],
  )

  const filteredServices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const baseServices = includeHidden ? services : activeServices

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

      return matchesSearch && matchesServiceStatusFilter(service, statusFilter)
    })
  }, [activeServices, includeHidden, search, services, statusFilter])

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
          activeServices={activeServices}
          meta={meta}
          services={services}
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
                표시합니다. 호출 결과와 응답 시간은 응답 측정 허용 목록
                대상만 표시합니다.
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
              <button
                className={includeHidden ? 'filter active' : 'filter'}
                onClick={() => setIncludeHidden(!includeHidden)}
                type="button"
              >
                숨김 Service 포함
              </button>
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
              includeHidden
                ? '표시할 Service가 없습니다'
                : "현재 표시할 사용자 Service가 없습니다. 숨김 Service를 보려면 '숨김 Service 포함'을 켜세요."
            }
            onSelectService={setSelectedServiceName}
            selectedServiceName={selectedServiceName}
            services={filteredServices}
          />
        </section>
      </section>

      <ServiceDetailPanel service={detailService} />
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

function isActiveService(service) {
  const activeCheckStatus = String(
    service.active_check?.last_status ?? '',
  ).toLowerCase()
  const userVisibleWaiting =
    service.status === 'waiting_server' && service.category === 'user'

  return (
    service.category === 'user' ||
    (service.server_count ?? 0) > 0 ||
    service.active_check_supported === true ||
    ['success', 'failed', 'timeout', 'error'].includes(activeCheckStatus) ||
    service.status === 'active' ||
    userVisibleWaiting
  )
}
