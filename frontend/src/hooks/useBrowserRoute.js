import { useCallback, useEffect, useState } from 'react'

const PAGE_PATHS = {
  actions: '/actions',
  alerts: '/alerts',
  nodes: '/nodes',
  overview: '/',
  services: '/services',
  settings: '/settings',
  topics: '/topics',
  visualization: '/visualization',
}

const PATH_PAGES = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]),
)

export function useBrowserRoute() {
  const [activePage, setActivePage] = useState(() => pageFromPathname(
    window.location.pathname,
  ))

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(pageFromPathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((page) => {
    const nextPage = PAGE_PATHS[page] ? page : 'overview'
    const path = pagePath(nextPage)
    if (window.location.pathname !== path) {
      window.history.pushState({ page: nextPage }, '', path)
    }
    setActivePage(nextPage)
  }, [])

  return { activePage, navigate }
}

export function pagePath(page) {
  return PAGE_PATHS[page] ?? PAGE_PATHS.overview
}

function pageFromPathname(pathname) {
  const normalized = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/'
  return PATH_PAGES[normalized] ?? 'overview'
}
