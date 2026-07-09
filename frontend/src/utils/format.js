export function formatTime(value) {
  if (!value) {
    return '-'
  }

  const date = value instanceof Date ? value : new Date(value * 1000)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleTimeString()
}

export function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-'
  }

  return Number(value).toFixed(digits)
}

export function formatAge(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${formatNumber(value, 2)}s`
}

export function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-'
  }

  return `${formatNumber(value, 2)} ms`
}

export function formatRelativeTime(value) {
  if (!value) {
    return '-'
  }

  const timestamp = value instanceof Date ? value.getTime() : value * 1000
  const diffMs = Date.now() - timestamp
  if (Number.isNaN(diffMs)) {
    return '-'
  }

  if (diffMs < 0) {
    return formatTime(value)
  }

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) {
    return `${diffSec}s 전`
  }

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return `${diffMin}분 전`
  }

  return formatTime(value)
}

export function formatCount(value) {
  if (value === null || value === undefined) {
    return 0
  }

  return value
}
