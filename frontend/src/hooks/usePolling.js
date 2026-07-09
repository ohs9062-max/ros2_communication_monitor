import { useEffect, useState } from 'react'

export function usePolling(fetcher, intervalMs, options = {}) {
  const { enabled = true, initialData = null } = options
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    async function poll() {
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
      }
    }

    poll()
    const timer = window.setInterval(poll, intervalMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, fetcher, intervalMs])

  return { data, error, lastUpdated, loading }
}
