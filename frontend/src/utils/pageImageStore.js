// The page-image store behind usePageImageStore, kept free of React so it can be tested on its own.

const CONCURRENT_REQUESTS = 3
// Pages this far either side of the open page are loaded ahead, so flipping never shows a blank page.
const PRELOAD_DISTANCE = 4

// Loads page images as blobs through loadPage(pageNumber, signal): the private viewer uses the
// authenticated API (an <img> cannot send the Firebase token), the public viewer the public API.
// Each blob becomes an object URL that lives only in this tab.
export function createPageImageStore(loadPage, pageCount) {
  const entries = new Map()
  const listeners = new Set()
  let controller = new AbortController()
  let focusPage = 1
  let activeRequests = 0

  function emit() {
    listeners.forEach((listener) => listener())
  }

  // Nearest unloaded page to the open one, looking forward first.
  function nextPageToLoad() {
    for (let distance = 0; distance <= PRELOAD_DISTANCE; distance++) {
      for (const pageNumber of [focusPage + distance, focusPage - distance]) {
        if (pageNumber >= 1 && pageNumber <= pageCount && !entries.has(pageNumber)) return pageNumber
      }
    }
    return null
  }

  async function load(pageNumber) {
    const { signal } = controller
    entries.set(pageNumber, { status: 'loading' })
    activeRequests++
    try {
      const image = await loadPage(pageNumber, signal)
      if (!signal.aborted) {
        entries.set(pageNumber, { status: 'loaded', url: URL.createObjectURL(image) })
      }
    } catch {
      if (!signal.aborted) entries.set(pageNumber, { status: 'failed' })
    } finally {
      if (!signal.aborted) {
        activeRequests--
        emit()
        loadNext()
      }
    }
  }

  function loadNext() {
    while (!controller.signal.aborted && activeRequests < CONCURRENT_REQUESTS) {
      const pageNumber = nextPageToLoad()
      if (pageNumber === null) return
      load(pageNumber)
    }
    emit()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get(pageNumber) {
      return entries.get(pageNumber)
    },
    // Called when the reader moves; pages near the new position that failed earlier are retried.
    // While the store is closed this only records the page; open() then loads it.
    setFocus(pageNumber) {
      focusPage = pageNumber
      for (const [loadedPage, entry] of entries) {
        if (entry.status === 'failed' && Math.abs(loadedPage - pageNumber) <= PRELOAD_DISTANCE) entries.delete(loadedPage)
      }
      loadNext()
    },
    // Reopening resumes loading around the last requested page. The reader asks for pages in its
    // own effect, which React runs before FlipbookReader's open(); in development StrictMode also
    // closes and reopens the store, so that request can arrive while the store is closed.
    open() {
      if (!controller.signal.aborted) return
      controller = new AbortController()
      loadNext()
    },
    close() {
      controller.abort()
      for (const entry of entries.values()) {
        if (entry.url) URL.revokeObjectURL(entry.url)
      }
      entries.clear()
      activeRequests = 0
    },
  }
}
