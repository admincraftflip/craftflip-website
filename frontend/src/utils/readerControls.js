// Rules behind the reader toolbar (zoom, direct page entry, the thumbnail panel, fullscreen), kept
// free of React so they can be tested on their own. Used by every viewing style.

// ---------- Zoom ----------

// 1 is fit to page: the book as large as the stage allows (utils/bookLayout.js). Higher levels
// enlarge the book and the stage scrolls to show the rest.
export const ZOOM_LEVELS = [1, 1.5, 2, 2.5]

export function zoomIn(zoom) {
  return ZOOM_LEVELS.find((level) => level > zoom) ?? ZOOM_LEVELS.at(-1)
}

export function zoomOut(zoom) {
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom) ?? ZOOM_LEVELS[0]
}

// The fitted page size times the zoom, whole pixels, proportions kept.
export function zoomLayout(layout, zoom) {
  if (zoom === 1) return layout
  return { ...layout, width: Math.floor(layout.width * zoom), height: Math.floor(layout.height * zoom) }
}

// ---------- Pages ----------

// What the reader typed into the page box: a whole page number within the book, or null.
export function parsePageInput(text, pageCount) {
  const value = String(text ?? '').trim()
  if (!/^\d{1,4}$/.test(value)) return null
  const pageNumber = Number(value)
  return pageNumber >= 1 && pageNumber <= pageCount ? pageNumber : null
}

// Page numbers on screen in the page-flip styles, from react-pageflip's index: the cover alone,
// then pairs on a spread, a last page alone (same rules as visiblePagesLabel).
export function pagesOnScreen(pageIndex, pageCount, spread) {
  const first = pageIndex + 1
  if (!spread || first === 1 || first >= pageCount) return [first]
  const left = first % 2 === 0 ? first : first - 1
  return [left, left + 1]
}

// ---------- Toolbar ----------

// Which controls fit the stage width. full: everything. compact (phones): one zoom button that
// zooms in, or returns to fit when zoomed. minimal (the narrowest screens): no zoom buttons; phones
// can still pinch to zoom.
export const TOOLBAR_FULL_MIN_WIDTH = 600
export const TOOLBAR_COMPACT_MIN_WIDTH = 340

export function toolbarMode(stageWidth) {
  if (stageWidth >= TOOLBAR_FULL_MIN_WIDTH) return 'full'
  if (stageWidth >= TOOLBAR_COMPACT_MIN_WIDTH) return 'compact'
  return 'minimal'
}

// ---------- Thumbnails ----------

const THUMBNAIL_CONCURRENCY = 4

// Loads page previews for the thumbnail panel, only for the pages asked for (the ones scrolled
// into view), a few at a time, newest request first. loadThumbnail(pageNumber, signal) resolves to
// a Blob (the small ?size=thumb image). Each preview is loaded once; a failed one can be asked for
// again. close() cancels everything and frees the object URLs.
export function createThumbnailStore(loadThumbnail) {
  const entries = new Map()
  const listeners = new Set()
  const queue = []
  const controller = new AbortController()
  let active = 0

  function emit() {
    listeners.forEach((listener) => listener())
  }

  async function load(pageNumber) {
    active++
    entries.set(pageNumber, { status: 'loading' })
    emit()
    try {
      const blob = await loadThumbnail(pageNumber, controller.signal)
      if (!controller.signal.aborted) entries.set(pageNumber, { status: 'loaded', url: URL.createObjectURL(blob) })
    } catch {
      if (!controller.signal.aborted) entries.set(pageNumber, { status: 'failed' })
    } finally {
      active--
      if (!controller.signal.aborted) {
        emit()
        pump()
      }
    }
  }

  function pump() {
    while (active < THUMBNAIL_CONCURRENCY && queue.length > 0) {
      const pageNumber = queue.pop()
      if (entries.get(pageNumber)?.status === 'queued') load(pageNumber)
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get(pageNumber) {
      return entries.get(pageNumber)
    },
    request(pageNumber) {
      if (controller.signal.aborted) return
      const status = entries.get(pageNumber)?.status
      if (status === 'loaded' || status === 'loading' || status === 'queued') return
      entries.set(pageNumber, { status: 'queued' })
      queue.push(pageNumber)
      pump()
    },
    // A preview scrolled out of view before it started is not loaded.
    cancel(pageNumber) {
      if (entries.get(pageNumber)?.status !== 'queued') return
      entries.delete(pageNumber)
      const index = queue.indexOf(pageNumber)
      if (index !== -1) queue.splice(index, 1)
    },
    close() {
      controller.abort()
      queue.length = 0
      for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url)
      entries.clear()
    },
  }
}

// ---------- Fullscreen ----------

// The Fullscreen API, with the webkit-prefixed names older Safari versions use. supported is false
// where the browser has no element fullscreen (iPhone Safari) or the page may not use it (an
// embed whose iframe lacks allowfullscreen); the toolbar then hides the button.
export function fullscreenApi(doc = globalThis.document) {
  if (!doc) return { supported: false }
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false
  const element = () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  return {
    supported: Boolean(enabled),
    element,
    async enter(target) {
      if (target.requestFullscreen) return target.requestFullscreen()
      return target.webkitRequestFullscreen?.()
    },
    async exit() {
      if (!element()) return
      if (doc.exitFullscreen) return doc.exitFullscreen()
      return doc.webkitExitFullscreen?.()
    },
    changeEvents: ['fullscreenchange', 'webkitfullscreenchange'],
  }
}

// ---------- Contents ----------

// The table of contents opens beside the book on wide stages (the book stays visible) and covers
// the stage on narrow ones, like the page overview.
export const CONTENTS_SIDE_PANEL_MIN_WIDTH = 640

export function contentsPanelLayout(stageWidth) {
  return stageWidth >= CONTENTS_SIDE_PANEL_MIN_WIDTH ? 'side' : 'cover'
}

// The section being read: the last one starting on or before the last page on screen (so a
// section that starts on the right-hand page of a spread is already the current one). -1 before
// the first section. contents is sorted by page.
export function currentSectionIndex(contents, visiblePages) {
  if (!contents?.length || !visiblePages?.length) return -1
  const lastShown = Math.max(...visiblePages)
  let current = -1
  contents.forEach((entry, index) => {
    if (entry.page <= lastShown) current = index
  })
  return current
}
