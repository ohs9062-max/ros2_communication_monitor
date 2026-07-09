export function SummaryCard({ label, value, tone = 'default' }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
