import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling(fetcher, intervalMs, options = {}) {
  const { enabled = true, initialData = null } = options
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const refreshInFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true
    setLoading(true)
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      refreshInFlightRef.current = false
      setLoading(false)
    }
  }, [enabled, fetcher])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    let pollInFlight = false

    async function poll() {
      if (pollInFlight) {
        return
      }

      pollInFlight = true
      try {
        const result = await fetcher()
        if (cancelled) {
          return
        }
        setData(result)
        setError(null)
        setLastUpdated(new Date())
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : 'Request failed')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
        pollInFlight = false
      }
    }

    poll()
    const timer = window.setInterval(poll, intervalMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, fetcher, intervalMs])

  return { data, error, lastUpdated, loading, refresh }
}
