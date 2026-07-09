import { useMemo, useState } from 'react'
import { AlertsPreview } from '../components/AlertsPreview.jsx'
import { ServiceDetailPanel } from '../components/ServiceDetailPanel.jsx'
import { ServiceSummaryCards } from '../components/ServiceSummaryCards.jsx'
import { ServiceTable } from '../components/ServiceTable.jsx'
import { matchesServiceStatusFilter } from '../utils/status.js'

const SERVICE_FILTERS = [
  { id: 'all', label: '전체' },
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

  const filteredServices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return services.filter((service) => {
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
  }, [search, services, statusFilter])

  return (
    <main className="topics-page">
      <section className="main-panel">
        <ServiceSummaryCards meta={meta} />
        <AlertsPreview
          alerts={serviceAlerts}
          emptyMessage="Service 알림 없음"
          error={alerts.error}
          title="Service Alert"
        />

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <h2>Service 상세</h2>
              <p className="muted">
                Service 목록은 3초마다 갱신됩니다. 호출 결과와 응답 시간은
                응답 측정 허용 목록 대상만 표시합니다.
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
                내부 Service 포함
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
            onSelectService={setSelectedServiceName}
            selectedServiceName={selectedServiceName}
            services={filteredServices}
          />
        </section>
      </section>

      <ServiceDetailPanel service={selectedService} />
    </main>
  )
}
