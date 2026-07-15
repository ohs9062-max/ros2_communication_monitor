export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function monitorWebSocketUrl() {
  const url = new URL(API_BASE_URL, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/monitor'
  url.search = ''
  url.hash = ''
  return url.toString()
}

async function requestJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

async function responseJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
  }
  return payload
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

export function fetchNodes() {
  return requestJson('/ros/nodes')
}

export function fetchInterfaceRegistry() {
  return requestJson('/ros/interfaces/registry')
}

export function fetchInterfaceApplyStatus() {
  return requestJson('/ros/interfaces/apply/status')
}

export function fetchCallableServices() {
  return requestJson('/ros/interfaces/callable-services')
}

export function fetchCallableActions() {
  return requestJson('/ros/interfaces/callable-actions')
}

export function fetchServiceCallHistory() {
  return requestJson('/ros/interfaces/service-call/history')
}

export function fetchActionGoalHistory() {
  return requestJson('/ros/interfaces/action-goal/history')
}

export async function applyInterfaces() {
  const response = await fetch(`${API_BASE_URL}/ros/interfaces/apply`, {
    method: 'POST',
  })
  return responseJson(response)
}

export async function callRegisteredService(payload) {
  const response = await fetch(`${API_BASE_URL}/ros/interfaces/service-call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return responseJson(response)
}

export async function sendActionGoal(payload) {
  const response = await fetch(`${API_BASE_URL}/ros/interfaces/action-goal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return responseJson(response)
}

export async function checkInterfaceImports() {
  const response = await fetch(`${API_BASE_URL}/ros/interfaces/import-check`, {
    method: 'POST',
  })
  return responseJson(response)
}

export async function uploadInterface(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}/ros/interfaces/upload`, {
    method: 'POST',
    body: formData,
  })
  return responseJson(response)
}
