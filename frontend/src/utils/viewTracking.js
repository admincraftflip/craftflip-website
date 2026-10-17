// Activity reports from the public viewer for the owner's analytics (Milestone 10), kept free of
// React so they can be tested on their own. The server's rules are in backend/utils/analytics.js.
//
// What is sent: a random visitor ID kept in this browser (no cookie; nothing about the device or
// the person), the pages shown, the referring site (the server keeps only its host) and whether the
// reader is an embed. Nothing is sent when the browser asks not to be tracked (Global Privacy
// Control or Do Not Track), or when this browser belongs to the flipbook's owner.

const VISITOR_KEY = 'craftflip.visitorId'
const OWNED_KEY = 'craftflip.ownedFlipbooks'
const MAX_OWNED = 500
// A page counts as viewed after this long on screen (quick flips past a page do not count).
export const PAGE_DWELL_MS = 1000
// Pages viewed are sent together, at most this often, and when the reader leaves.
export const REPORT_INTERVAL_MS = 10_000
const MAX_PAGES_PER_REPORT = 50

function safeStorage(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function newId(crypto = globalThis.crypto) {
  return crypto.randomUUID()
}

// The browser's visitor ID: created once and kept in localStorage. Where storage is blocked
// (some private windows, strict settings), a new ID is used for this page load only, so that
// visit is still counted, as a new visitor.
export function visitorIdFor(storage, crypto) {
  const store = safeStorage(storage)
  try {
    const existing = store?.getItem(VISITOR_KEY)
    if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing
    const id = newId(crypto)
    store?.setItem(VISITOR_KEY, id)
    return id
  } catch {
    return newId(crypto)
  }
}

// The owner's dashboard and preview record the slugs of their flipbooks in this browser, so the
// owner opening their own public link or embed is not counted as a visitor. It is a convenience
// for the owner's own browser, not access control.
export function rememberOwnedFlipbooks(slugs, storage) {
  const store = safeStorage(storage)
  try {
    const current = JSON.parse(store?.getItem(OWNED_KEY) ?? '[]')
    const merged = [...new Set([...slugs.filter((slug) => typeof slug === 'string'), ...(Array.isArray(current) ? current : [])])].slice(0, MAX_OWNED)
    store?.setItem(OWNED_KEY, JSON.stringify(merged))
  } catch {
    // Not remembered: the owner's own visits may then be counted.
  }
}

export function isOwnedHere(slug, storage) {
  const store = safeStorage(storage)
  try {
    const owned = JSON.parse(store?.getItem(OWNED_KEY) ?? '[]')
    return Array.isArray(owned) && owned.includes(slug)
  } catch {
    return false
  }
}

export function trackingAllowed(navigatorLike = globalThis.navigator) {
  if (!navigatorLike) return false
  if (navigatorLike.globalPrivacyControl === true) return false
  if (navigatorLike.doNotTrack === '1' || navigatorLike.doNotTrack === 'yes') return false
  return true
}

// Sends one report. Returns "ok", "stop" (the server refused it: unpublished, invalid or rate
// limited; the tracker then stops for this page load) or "retry" (network or server trouble).
// text/plain keeps it a simple request (no CORS preflight); keepalive lets the last report
// finish while the page closes.
export async function sendActivity(apiBase, slug, report, { final = false, fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(`${apiBase}/api/public/flipbooks/${encodeURIComponent(slug)}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(report),
      keepalive: final,
      credentials: 'omit',
    })
    if (response.ok) return 'ok'
    return response.status >= 500 ? 'retry' : 'stop'
  } catch {
    return 'retry'
  }
}

// One page load's reporting. start() reports the visit; show(pages) is called whenever the pages
// on screen change; leave() sends what is left (page hidden or closed); stop() ends it. send(report,
// { final }) resolves to "ok", "stop" or "retry". Reports never overlap, so the server sees the
// visit before the pages. Failures are dropped quietly: reading never depends on analytics.
export function createViewTracker({ visitorId, referrer = '', embedded = false, send, timers = globalThis }) {
  const reported = new Set()
  const pending = new Set()
  let dwellTimer = null
  let flushTimer = null
  let inFlight = null
  // stopped: the server refused a report, so nothing more is sent. closed: the page ended the
  // tracker; the last pages are still sent, then nothing more.
  let stopped = false
  let closed = false
  let started = false

  function report(pages) {
    return { visitorId, pages, referrer: referrer || null, embedded }
  }

  async function deliver(pages, final) {
    if (stopped) return
    const result = await send(report(pages), { final })
    if (result === 'stop') {
      stopped = true
      return
    }
    if (result === 'ok') {
      pages.forEach((page) => reported.add(page))
      pages.forEach((page) => pending.delete(page))
    }
  }

  async function flush(final = false) {
    if (flushTimer) {
      timers.clearTimeout(flushTimer)
      flushTimer = null
    }
    if (inFlight) await inFlight
    if (stopped || pending.size === 0) return
    const pages = [...pending].sort((first, second) => first - second).slice(0, MAX_PAGES_PER_REPORT)
    inFlight = deliver(pages, final).finally(() => {
      inFlight = null
    })
    await inFlight
  }

  function scheduleFlush() {
    if (flushTimer || stopped || closed) return
    flushTimer = timers.setTimeout(() => {
      flushTimer = null
      flush()
    }, REPORT_INTERVAL_MS)
  }

  return {
    start() {
      if (started || stopped || closed) return inFlight
      started = true
      inFlight = deliver([], false).finally(() => {
        inFlight = null
      })
      return inFlight
    },
    show(pages) {
      if (dwellTimer) timers.clearTimeout(dwellTimer)
      dwellTimer = null
      if (stopped || closed || !Array.isArray(pages) || pages.length === 0) return
      dwellTimer = timers.setTimeout(() => {
        dwellTimer = null
        const fresh = pages.filter((page) => !reported.has(page))
        if (fresh.length === 0) return
        fresh.forEach((page) => pending.add(page))
        scheduleFlush()
      }, PAGE_DWELL_MS)
    },
    leave() {
      return flush(true)
    },
    stop() {
      if (dwellTimer) timers.clearTimeout(dwellTimer)
      dwellTimer = null
      closed = true
      return flush(true)
    },
    get stopped() {
      return stopped || closed
    },
  }
}
