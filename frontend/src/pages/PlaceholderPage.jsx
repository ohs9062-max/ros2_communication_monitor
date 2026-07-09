export function PlaceholderPage({ title, message }) {
  return (
    <main className="single-page">
      <section className="placeholder-panel">
        <p className="eyebrow">준비 중</p>
        <h2>{title}</h2>
        <p className="muted">{message}</p>
      </section>
    </main>
  )
}
