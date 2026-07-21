import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling(fetcher, intervalMs, options = {}) {
  const { enabled = true, initialData = null, resetKey = fetcher } = options
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const fetcherRef = useRef(fetcher)
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

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
      const result = await fetcherRef.current()
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      refreshInFlightRef.current = false
      setLoading(false)
    }
  }, [enabled])

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
        const result = await fetcherRef.current()
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
  }, [enabled, intervalMs, resetKey])

  return { data, error, lastUpdated, loading, refresh }
}
