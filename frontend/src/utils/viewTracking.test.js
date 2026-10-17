import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAGE_DWELL_MS,
  REPORT_INTERVAL_MS,
  createViewTracker,
  isOwnedHere,
  rememberOwnedFlipbooks,
  sendActivity,
  trackingAllowed,
  visitorIdFor,
} from './viewTracking.js'

const VISITOR = '0f8fad5b-d9cb-469f-a165-70867728950e'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values }
}

// A controllable clock: timers run only when advance() passes their time.
function fakeTimers() {
  let now = 0
  let nextId = 1
  const pending = new Map()
  return {
    setTimeout(callback, delay) {
      const id = nextId++
      pending.set(id, { at: now + delay, callback })
      return id
    },
    clearTimeout(id) {
      pending.delete(id)
    },
    async advance(ms) {
      const target = now + ms
      for (;;) {
        const due = [...pending.entries()].filter(([, timer]) => timer.at <= target).sort((first, second) => first[1].at - second[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].callback()
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      now = target
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

function recordingSend(results = []) {
  const reports = []
  const send = async (report, options) => {
    reports.push({ ...report, final: options.final })
    return results.shift() ?? 'ok'
  }
  return { reports, send }
}

test('a visit is reported once when the flipbook opens, with the referrer and embed flag', async () => {
  const { reports, send } = recordingSend()
  const tracker = createViewTracker({ visitorId: VISITOR, referrer: 'https://agency.example/listing', embedded: true, send, timers: fakeTimers() })
  await tracker.start()
  await tracker.start()
  assert.deepEqual(reports, [{ visitorId: VISITOR, pages: [], referrer: 'https://agency.example/listing', embedded: true, final: false }])
})

test('a page counts only after a second on screen; quick flips past pages are not reported', async () => {
  const timers = fakeTimers()
  const { reports, send } = recordingSend()
  const tracker = createViewTracker({ visitorId: VISITOR, send, timers })
  await tracker.start()
  tracker.show([1])
  await timers.advance(PAGE_DWELL_MS)
  tracker.show([2, 3])
  await timers.advance(300)
  tracker.show([4, 5])
  await timers.advance(300)
  tracker.show([6, 7])
  await timers.advance(PAGE_DWELL_MS)
  await timers.advance(REPORT_INTERVAL_MS)
  assert.deepEqual(reports.slice(1).map((report) => report.pages), [[1, 6, 7]])
})

test('pages are sent together at most every ten seconds, each page only once per page load', async () => {
  const timers = fakeTimers()
  const { reports, send } = recordingSend()
  const tracker = createViewTracker({ visitorId: VISITOR, send, timers })
  await tracker.start()
  for (const pages of [[1], [2, 3], [1], [4, 5]]) {
    tracker.show(pages)
    await timers.advance(PAGE_DWELL_MS + 100)
  }
  assert.equal(reports.length, 1)
  await timers.advance(REPORT_INTERVAL_MS)
  assert.deepEqual(reports.slice(1).map((report) => report.pages), [[1, 2, 3, 4, 5]])
  tracker.show([2, 3])
  await timers.advance(PAGE_DWELL_MS + REPORT_INTERVAL_MS)
  assert.equal(reports.length, 2)
})

test('leaving sends the pages not yet reported at once, marked as final', async () => {
  const timers = fakeTimers()
  const { reports, send } = recordingSend()
  const tracker = createViewTracker({ visitorId: VISITOR, send, timers })
  await tracker.start()
  tracker.show([8])
  await timers.advance(PAGE_DWELL_MS)
  await tracker.leave()
  assert.deepEqual(reports.at(-1), { visitorId: VISITOR, pages: [8], referrer: null, embedded: false, final: true })
  await tracker.leave()
  assert.equal(reports.length, 2)
})

test('stopping sends the last pages, then nothing more is reported', async () => {
  const timers = fakeTimers()
  const { reports, send } = recordingSend()
  const tracker = createViewTracker({ visitorId: VISITOR, send, timers })
  await tracker.start()
  tracker.show([3])
  await timers.advance(PAGE_DWELL_MS)
  await tracker.stop()
  assert.deepEqual(reports.at(-1).pages, [3])
  tracker.show([4])
  await timers.advance(PAGE_DWELL_MS + REPORT_INTERVAL_MS)
  await tracker.start()
  assert.equal(reports.length, 2)
  assert.equal(tracker.stopped, true)
})

test('a refused report (unpublished, invalid or rate limited) stops reporting; a network failure is retried later', async () => {
  const timers = fakeTimers()
  const retrying = recordingSend(['ok', 'retry', 'ok'])
  const tracker = createViewTracker({ visitorId: VISITOR, send: retrying.send, timers })
  await tracker.start()
  tracker.show([1])
  await timers.advance(PAGE_DWELL_MS + REPORT_INTERVAL_MS)
  tracker.show([2])
  await timers.advance(PAGE_DWELL_MS + REPORT_INTERVAL_MS)
  assert.deepEqual(retrying.reports.map((report) => report.pages), [[], [1], [1, 2]])

  const refused = recordingSend(['stop'])
  const stopped = createViewTracker({ visitorId: VISITOR, send: refused.send, timers })
  await stopped.start()
  stopped.show([1])
  await timers.advance(PAGE_DWELL_MS + REPORT_INTERVAL_MS)
  await stopped.leave()
  assert.equal(refused.reports.length, 1)
  assert.equal(stopped.stopped, true)
})

test('reports never overlap: the visit is sent before any pages', async () => {
  const timers = fakeTimers()
  const order = []
  let release
  const send = (report) => {
    order.push(report.pages.length === 0 ? 'visit' : 'pages')
    if (report.pages.length === 0) return new Promise((resolve) => (release = () => resolve('ok')))
    return Promise.resolve('ok')
  }
  const tracker = createViewTracker({ visitorId: VISITOR, send, timers })
  tracker.start()
  tracker.show([1])
  await timers.advance(PAGE_DWELL_MS)
  const leaving = tracker.leave()
  assert.deepEqual(order, ['visit'])
  release()
  await leaving
  assert.deepEqual(order, ['visit', 'pages'])
})

test('the visitor ID is random, kept in this browser, and replaced only when missing or invalid', () => {
  const storage = memoryStorage()
  const crypto = { randomUUID: () => VISITOR }
  assert.equal(visitorIdFor(storage, crypto), VISITOR)
  assert.equal(storage.values.get('craftflip.visitorId'), VISITOR)
  assert.equal(visitorIdFor(storage, { randomUUID: () => 'other' }), VISITOR)
  assert.equal(visitorIdFor(memoryStorage({ 'craftflip.visitorId': 'tampered<script>' }), crypto), VISITOR)
  // Blocked storage: a new ID for this page load only.
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(visitorIdFor(blocked, crypto), VISITOR)
})

test("the owner's own flipbooks are remembered in their browser and not tracked there", () => {
  const storage = memoryStorage()
  rememberOwnedFlipbooks(['riverside-ab12', 'harbour-cd34'], storage)
  rememberOwnedFlipbooks(['riverside-ab12', 'new-ef56', null], storage)
  assert.equal(isOwnedHere('riverside-ab12', storage), true)
  assert.equal(isOwnedHere('new-ef56', storage), true)
  assert.equal(isOwnedHere('someone-elses-gh78', storage), false)
  assert.equal(isOwnedHere('x', memoryStorage({ 'craftflip.ownedFlipbooks': 'not json' })), false)
})

test('browsers that ask not to be tracked are not tracked', () => {
  assert.equal(trackingAllowed({}), true)
  assert.equal(trackingAllowed({ globalPrivacyControl: true }), false)
  assert.equal(trackingAllowed({ doNotTrack: '1' }), false)
  assert.equal(trackingAllowed({ doNotTrack: 'unspecified' }), true)
  assert.equal(trackingAllowed(null), false)
})

test('a report is a simple text/plain POST to the public activity route, without credentials', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, status: 204 }
  }
  assert.equal(await sendActivity('https://api.example', 'riverside-ab12', { visitorId: VISITOR, pages: [1] }, { final: true, fetchImpl }), 'ok')
  assert.equal(calls[0].url, 'https://api.example/api/public/flipbooks/riverside-ab12/activity')
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8')
  assert.equal(calls[0].options.keepalive, true)
  assert.equal(calls[0].options.credentials, 'omit')
  assert.deepEqual(JSON.parse(calls[0].options.body), { visitorId: VISITOR, pages: [1] })
  for (const [status, expected] of [[404, 'stop'], [400, 'stop'], [429, 'stop'], [500, 'retry'], [503, 'retry']]) {
    assert.equal(await sendActivity('', 's-ab12', {}, { fetchImpl: async () => ({ ok: false, status }) }), expected, String(status))
  }
  assert.equal(await sendActivity('', 's-ab12', {}, { fetchImpl: async () => { throw new TypeError('offline') } }), 'retry')
})
