export function compareSortValues(left, right, direction = 'asc') {
  const leftMissing = isMissingSortValue(left)
  const rightMissing = isMissingSortValue(right)

  if (leftMissing && rightMissing) {
    return 0
  }

  if (leftMissing) {
    return 1
  }

  if (rightMissing) {
    return -1
  }

  const leftNumber = toSortNumber(left)
  const rightNumber = toSortNumber(right)
  let result

  if (leftNumber !== null && rightNumber !== null) {
    result = leftNumber - rightNumber
  } else {
    result = String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }

  return direction === 'desc' ? -result : result
}

export function nextSortState(currentSort, key, columns) {
  const column = columns[key] ?? {}
  if (currentSort.key !== key) {
    return {
      key,
      direction: column.defaultDirection ?? 'asc',
    }
  }

  return {
    key,
    direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
  }
}

export function sortRows(rows, sort, columns) {
  const column = columns[sort.key]
  if (!column) {
    return rows
  }

  return [...rows].sort((left, right) =>
    compareSortValues(column.value(left), column.value(right), sort.direction),
  )
}

function isMissingSortValue(value) {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'number') {
    return Number.isNaN(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return !trimmed || trimmed === '-'
  }

  return false
}

function toSortNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
