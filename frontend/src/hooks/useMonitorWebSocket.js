import { useEffect, useMemo, useState } from 'react'
import { monitorWebSocketUrl } from '../api/rosApi.js'

const RECONNECT_DELAY_MS = 2500

export function useMonitorWebSocket() {
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [lastMessage, setLastMessage] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const url = useMemo(() => monitorWebSocketUrl(), [])

  useEffect(() => {
    let closedByEffect = false
    let reconnectTimer = null
    let socket = null

    function connect() {
      setStatus('connecting')
      socket = new WebSocket(url)

      socket.onopen = () => {
        setError(null)
        setStatus('connected')
      }

      socket.onmessage = (event) => {
        setLastMessage(event.data)
        try {
          const parsed = JSON.parse(event.data)
          setSnapshot(parsed)
          setLastUpdatedAt(parsed.timestamp ?? Date.now() / 1000)
        } catch (parseError) {
          setError(parseError)
        }
      }

      socket.onerror = () => {
        setStatus('error')
        setError(new Error('WebSocket connection error'))
      }

      socket.onclose = () => {
        if (closedByEffect) {
          return
        }

        setStatus('disconnected')
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      closedByEffect = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      socket?.close()
    }
  }, [url])

  return {
    connected: status === 'connected',
    connecting: status === 'connecting',
    error,
    lastMessage,
    lastUpdatedAt,
    snapshot,
    status,
  }
}
