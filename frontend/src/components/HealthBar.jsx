export function HealthBar({ segments }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  return (
    <div className="health-bar" aria-label="리소스 상태 분포">
      {segments.map((segment) => {
        const width = total > 0 ? `${(segment.value / total) * 100}%` : '0%'
        return (
          <span
            className={`health-segment ${segment.tone}`}
            key={segment.label}
            style={{ width }}
            title={`${segment.label}: ${segment.value}`}
          />
        )
      })}
      {total === 0 && <span className="health-segment empty" />}
    </div>
  )
}
