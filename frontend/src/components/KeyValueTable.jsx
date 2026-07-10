import { useState } from 'react'

const VISIBLE_VALUE_COUNT = 3

export function KeyValueTable({ values }) {
  const [expanded, setExpanded] = useState(false)

  if (!Array.isArray(values) || values.length === 0) {
    return <div className="empty-state compact">표시할 값이 없습니다</div>
  }

  const visibleValues = expanded
    ? values
    : values.slice(0, VISIBLE_VALUE_COUNT)
  const hiddenCount = Math.max(values.length - visibleValues.length, 0)

  return (
    <>
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
          {visibleValues.map((item, index) => (
            <tr key={`${item.key}-${index}`}>
              <td>{item.key ?? '-'}</td>
              <td>{String(item.value ?? '-')}</td>
              <td>{item.value_type || '-'}</td>
              <td>{item.unit || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {values.length > VISIBLE_VALUE_COUNT && (
        <button
          className="connection-node-toggle"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? '접기' : `더 보기 ${hiddenCount}개`}
        </button>
      )}
    </>
  )
}
