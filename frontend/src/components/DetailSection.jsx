export function DetailSection({ children, collapsible = false, defaultOpen = false, title }) {
  if (collapsible) {
    return (
      <details className="detail-section detail-section-collapsible" open={defaultOpen}>
        <summary>{title}</summary>
        <div className="detail-section-body">
          {children}
        </div>
      </details>
    )
  }

  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
