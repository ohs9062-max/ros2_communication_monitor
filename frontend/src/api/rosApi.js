const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function requestJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

export function fetchHealth() {
  return requestJson('/health')
}

export function fetchTopics() {
  return requestJson('/ros/topics')
}

export function fetchTopicLatest(name) {
  return requestJson(`/ros/topics/latest?name=${encodeURIComponent(name)}`)
}

export function fetchTopicHz(name) {
  return requestJson(`/ros/topics/hz?name=${encodeURIComponent(name)}`)
}

export function fetchAlerts() {
  return requestJson('/ros/alerts')
}

export function fetchServices({ includeHidden = false } = {}) {
  const query = includeHidden ? '?include_hidden=true' : ''
  return requestJson(`/ros/services${query}`)
}

export function fetchActions() {
  return requestJson('/ros/actions')
}
