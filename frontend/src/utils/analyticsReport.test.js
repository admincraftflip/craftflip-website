import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RANGE_OPTIONS,
  bucketLabel,
  columnLayout,
  deviceShares,
  formatCount,
  labelIndexes,
  lastViewedLabel,
  loadAccountReport,
  loadFlipbookReport,
  niceScale,
  reportState,
  sourceLabel,
} from './analyticsReport.js'

const REPORT = { totals: { views: 3, uniqueVisitors: 2, averagePagesPerView: 2.5 } }

test('the dashboard shows loading, error, empty or the figures', () => {
  assert.equal(reportState({ loading: true, error: null, data: null }), 'loading')
  assert.equal(reportState({ loading: false, error: 'Something went wrong.', data: null }), 'error')
  assert.equal(reportState({ loading: false, error: null, data: { totals: { views: 0 } } }), 'empty')
  assert.equal(reportState({ loading: false, error: null, data: REPORT }), 'ready')
  // A refresh keeps the previous figures on screen, and so does a failed refresh.
  assert.equal(reportState({ loading: true, error: null, data: REPORT }), 'ready')
  assert.equal(reportState({ loading: false, error: 'Offline', data: REPORT }), 'ready')
})

test('reports are requested with the period and time zone; failures return the server message', async () => {
  const calls = []
  const client = {
    async get(url, options) {
      calls.push([url, options.params])
      if (url.includes('missing')) throw Object.assign(new Error('x'), { response: { status: 404, data: { success: false, message: 'Flipbook not found.' } } })
      return { data: { data: REPORT } }
    },
  }
  assert.deepEqual(await loadAccountReport(client, '7d', 'Asia/Dhaka'), { ok: true, data: REPORT })
  assert.deepEqual(calls[0], ['/api/analytics', { range: '7d', tz: 'Asia/Dhaka' }])
  await loadFlipbookReport(client, 'abc', 'all', 'UTC')
  assert.deepEqual(calls[1], ['/api/analytics/flipbooks/abc', { range: 'all', tz: 'UTC' }])
  assert.deepEqual(await loadFlipbookReport(client, 'missing', '30d', 'UTC'), { ok: false, missing: true, message: 'Flipbook not found.' })
  const offline = await loadAccountReport({ get: async () => { throw new TypeError('Network Error') } }, '30d', 'UTC')
  assert.deepEqual(offline, { ok: false, missing: false, message: 'Something went wrong. Please try again.' })
  assert.deepEqual(RANGE_OPTIONS.map((option) => option.id), ['7d', '30d', '90d', 'all'])
})

test('counts are exact below 10,000 and compact above', () => {
  assert.equal(formatCount(0, 'en-US'), '0')
  assert.equal(formatCount(1284, 'en-US'), '1,284')
  assert.equal(formatCount(12900, 'en-US'), '12.9K')
  assert.equal(formatCount(2.5, 'en-US'), '2.5')
})

test('chart labels name the day or the month', () => {
  assert.equal(bucketLabel('2026-10-17', 'day', 'en-GB'), '17 Oct')
  assert.equal(bucketLabel('2026-10', 'month', 'en-GB'), 'Oct 2026')
  assert.match(bucketLabel('2026-10-17', 'day', 'en-GB', { long: true }), /17 October 2026/)
})

test('the count axis uses round steps and never exaggerates a few views', () => {
  assert.deepEqual(niceScale(0), { max: 4, ticks: [0, 1, 2, 3, 4] })
  assert.deepEqual(niceScale(1), { max: 4, ticks: [0, 1, 2, 3, 4] })
  assert.deepEqual(niceScale(7), { max: 8, ticks: [0, 2, 4, 6, 8] })
  assert.deepEqual(niceScale(37), { max: 40, ticks: [0, 10, 20, 30, 40] })
  const large = niceScale(1234)
  assert.ok(large.max >= 1234)
  assert.ok(large.ticks.every((tick) => tick % 100 === 0))
})

test('columns are at most 24px, grow from the baseline, and every slot is a full-height hover target', () => {
  const points = [
    { date: '2026-10-15', views: 0, uniqueVisitors: 0 },
    { date: '2026-10-16', views: 2, uniqueVisitors: 1 },
    { date: '2026-10-17', views: 4, uniqueVisitors: 3 },
  ]
  const columns = columnLayout(points, { width: 300, height: 100, maxValue: 4 })
  assert.equal(columns[0].height, 0)
  assert.equal(columns[1].height, 50)
  assert.equal(columns[2].y, 0)
  for (const column of columns) {
    assert.ok(column.width <= 24)
    assert.equal(column.y + column.height, 100)
    assert.equal(column.hitWidth, 100)
    assert.ok(column.x >= column.hitX && column.x + column.width <= column.hitX + column.hitWidth)
  }
  // Ninety days in 300px: thin columns with a 2px gap.
  const ninety = columnLayout(Array.from({ length: 90 }, (_, index) => ({ date: String(index), views: 1, uniqueVisitors: 1 })), { width: 300, height: 100, maxValue: 4 })
  assert.ok(ninety[1].x - (ninety[0].x + ninety[0].width) >= 1.9)
})

test('x-axis labels are spaced out and always include the last bucket', () => {
  assert.deepEqual(labelIndexes(7, 420), [0, 1, 2, 3, 4, 5, 6])
  const month = labelIndexes(30, 300)
  assert.equal(month.at(-1), 29)
  assert.ok(month.length <= 5)
  assert.deepEqual(labelIndexes(0, 300), [])
})

test('sources, devices and the last view read plainly', () => {
  assert.equal(sourceLabel({ host: null, embedded: false }), 'Direct or unknown')
  assert.equal(sourceLabel({ host: 'facebook.com', embedded: false }), 'facebook.com')
  assert.equal(sourceLabel({ host: 'agency.example', embedded: true }), 'Embedded on agency.example')
  assert.equal(sourceLabel({ host: null, embedded: true }), 'Embedded on a website')
  assert.deepEqual(deviceShares({ desktop: 1, mobile: 3, tablet: 0 }).map((share) => [share.label, share.percent]), [
    ['Mobile', 75],
    ['Desktop', 25],
    ['Tablet', 0],
  ])
  assert.ok(deviceShares({}).every((share) => share.percent === 0))
  const now = new Date('2026-10-17T12:00:00Z')
  assert.equal(lastViewedLabel(null, now), 'No views yet')
  assert.equal(lastViewedLabel('2026-10-17T10:00:00Z', now, 'en'), '2 hours ago')
  assert.equal(lastViewedLabel('2026-10-17T11:59:50Z', now, 'en'), 'Just now')
})
