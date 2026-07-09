export function KeyValueTable({ values }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <div className="empty-state compact">표시할 값이 없습니다</div>
  }

  return (
    <table className="kv-table">
      <thead>
        <tr>
          <th>키</th>
          <th>값</th>
          <th>타입</th>
          <th>단위</th>
        </tr>
      </thead>
      <tbody>
        {values.map((item, index) => (
          <tr key={`${item.key}-${index}`}>
            <td>{item.key ?? '-'}</td>
            <td>{String(item.value ?? '-')}</td>
            <td>{item.value_type || '-'}</td>
            <td>{item.unit || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
