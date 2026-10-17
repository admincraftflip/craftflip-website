import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  VIEW_SESSION_GAP_MS,
  dayKey,
  deviceTypeFrom,
  fillSeries,
  isLikelyBot,
  monthKeys,
  parseActivity,
  parseReportQuery,
  referrerHost,
  reportPipeline,
  reportWindow,
  sessionUpsert,
  shapeFlipbookRows,
  shapeReport,
  zonedStartOfDay,
} from '../utils/analytics.js'

const VISITOR = '0f8fad5b-d9cb-469f-a165-70867728950e'

test('an activity report needs a random visitor ID and valid pages; extra fields are refused', () => {
  assert.deepEqual(parseActivity({ visitorId: VISITOR.toUpperCase(), pages: [3, 1, 3], referrer: 'https://www.agency.example/listing?id=42', embedded: true }, 10), {
    visitorId: VISITOR,
    pages: [1, 3],
    referrerHost: 'agency.example',
    embedded: true,
  })
  assert.deepEqual(parseActivity({ visitorId: VISITOR }, 10), { visitorId: VISITOR, pages: [], referrerHost: null, embedded: false })
  for (const body of [
    null,
    [],
    'x',
    {},
    { visitorId: 'not-a-uuid' },
    { visitorId: `${VISITOR}x` },
    { visitorId: VISITOR, pages: [0] },
    { visitorId: VISITOR, pages: [11] },
    { visitorId: VISITOR, pages: [1.5] },
    { visitorId: VISITOR, pages: ['2'] },
    { visitorId: VISITOR, pages: Array.from({ length: 51 }, () => 1) },
    { visitorId: VISITOR, pages: 3 },
    { visitorId: VISITOR, embedded: 'yes' },
    { visitorId: VISITOR, referrer: 42 },
    { visitorId: VISITOR, ownerId: '6ad0d2d3a1fe9c5bd7ed9c97' },
    { visitorId: VISITOR, ip: '203.0.113.9' },
  ]) {
    assert.ok(parseActivity(body, 10).error, JSON.stringify(body))
  }
})

test('only the host of a web referrer is kept, never its path or query', () => {
  assert.equal(referrerHost('https://www.Facebook.com/some/post?fbclid=abc'), 'facebook.com')
  assert.equal(referrerHost('http://agency.example:8080/a'), 'agency.example')
  for (const value of ['', null, 'not a url', 'javascript:alert(1)', 'file:///etc/passwd', 'android-app://com.example', `https://${'a'.repeat(2050)}.com`]) {
    assert.equal(referrerHost(value), null, String(value))
  }
})

test('crawlers and requests without a user agent are not visitors; devices are classed from the user agent', () => {
  for (const agent of ['', undefined, 'Googlebot/2.1', 'facebookexternalhit/1.1', 'Mozilla/5.0 HeadlessChrome/120', 'curl/8.4.0', 'WhatsApp link preview']) {
    assert.equal(isLikelyBot(agent), true, String(agent))
  }
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  const androidPhone = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
  const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  assert.equal(isLikelyBot(desktop), false)
  assert.equal(deviceTypeFrom(iphone), 'mobile')
  assert.equal(deviceTypeFrom(androidPhone), 'mobile')
  assert.equal(deviceTypeFrom(androidTablet), 'tablet')
  assert.equal(deviceTypeFrom(ipad), 'tablet')
  assert.equal(deviceTypeFrom(desktop), 'desktop')
})

test("a report continues the visitor's view within 30 minutes of their last activity, or starts a new one", () => {
  const flipbook = { _id: new mongoose.Types.ObjectId(), ownerId: new mongoose.Types.ObjectId() }
  const now = new Date('2026-10-17T10:00:00Z')
  const { filter, update, options } = sessionUpsert({ flipbook, activity: { visitorId: VISITOR, pages: [1, 2], referrerHost: 'agency.example', embedded: false }, deviceType: 'mobile', now })
  assert.equal(VIEW_SESSION_GAP_MS, 30 * 60 * 1000)
  assert.deepEqual(filter, { flipbookId: flipbook._id, visitorId: VISITOR, lastSeenAt: { $gte: new Date('2026-10-17T09:30:00Z') } })
  assert.deepEqual(update.$set, { lastSeenAt: now })
  assert.deepEqual(update.$addToSet, { pagesViewed: { $each: [1, 2] } })
  // Set only when the view starts: the owner comes from the stored flipbook, never the request.
  assert.deepEqual(update.$setOnInsert, { ownerId: flipbook.ownerId, startedAt: now, deviceType: 'mobile', referrerHost: 'agency.example', embedded: false, country: null })
  assert.equal(options.upsert, true)
  assert.deepEqual(options.sort, { lastSeenAt: -1 })
})

test('report periods and time zones are validated', () => {
  assert.deepEqual(parseReportQuery({}), { range: '30d', timeZone: 'UTC' })
  assert.deepEqual(parseReportQuery({ range: '7d', tz: 'Asia/Dhaka' }), { range: '7d', timeZone: 'Asia/Dhaka' })
  assert.deepEqual(parseReportQuery({ range: 'all', tz: 'America/New_York' }), { range: 'all', timeZone: 'America/New_York' })
  for (const query of [{ range: '365d' }, { range: ['7d'] }, { range: '' }, { tz: 'Mars/Olympus' }, { tz: 'UTC; drop' }, { tz: 'a'.repeat(65) }, { tz: ['UTC'] }]) {
    assert.ok(parseReportQuery(query).error, JSON.stringify(query))
  }
})

test("days start at the owner's local midnight, including across daylight-saving changes", () => {
  assert.equal(zonedStartOfDay(new Date('2026-10-17T15:00:00Z'), 'UTC').toISOString(), '2026-10-17T00:00:00.000Z')
  // Dhaka is UTC+6 all year.
  assert.equal(zonedStartOfDay(new Date('2026-10-17T03:00:00Z'), 'Asia/Dhaka').toISOString(), '2026-10-16T18:00:00.000Z')
  // New York on the day clocks go back (1 November 2026): midnight is still EDT (UTC-4).
  assert.equal(zonedStartOfDay(new Date('2026-11-01T20:00:00Z'), 'America/New_York').toISOString(), '2026-11-01T04:00:00.000Z')
  assert.equal(zonedStartOfDay(new Date('2026-11-02T20:00:00Z'), 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z')
  assert.equal(dayKey(new Date('2026-10-17T20:00:00Z'), 'Asia/Dhaka'), '2026-10-18')
})

test('a rolling period has one key per day including today, starting at local midnight', () => {
  const now = new Date('2026-10-17T03:00:00Z')
  const week = reportWindow('7d', 'Asia/Dhaka', now)
  assert.equal(week.bucket, 'day')
  assert.deepEqual(week.keys, ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
  assert.equal(week.from.toISOString(), '2026-10-10T18:00:00.000Z')
  assert.equal(reportWindow('30d', 'UTC', now).keys.length, 30)
  assert.equal(reportWindow('90d', 'UTC', now).keys.length, 90)
  // Across the New York DST change the first day still starts at local midnight.
  const autumn = reportWindow('7d', 'America/New_York', new Date('2026-11-03T12:00:00Z'))
  assert.equal(autumn.keys[0], '2026-10-28')
  assert.equal(autumn.from.toISOString(), '2026-10-28T04:00:00.000Z')
  assert.deepEqual(reportWindow('all', 'UTC', now), { from: null, bucket: 'month', keys: null })
})

test('the all-time chart runs month by month from the first month with views to now', () => {
  const now = new Date('2026-10-17T12:00:00Z')
  assert.deepEqual(monthKeys('2026-08', now, 'UTC'), ['2026-08', '2026-09', '2026-10'])
  assert.deepEqual(monthKeys('2025-12', now, 'UTC').slice(0, 2), ['2025-12', '2026-01'])
  assert.deepEqual(monthKeys(undefined, now, 'UTC'), ['2026-10'])
  assert.deepEqual(fillSeries(['2026-10-15', '2026-10-16'], [{ _id: '2026-10-16', views: 3, uniqueVisitors: 2 }]), [
    { date: '2026-10-15', views: 0, uniqueVisitors: 0 },
    { date: '2026-10-16', views: 3, uniqueVisitors: 2 },
  ])
})

test('the report aggregation filters first and never outputs visitor IDs', () => {
  const ownerId = new mongoose.Types.ObjectId()
  const pipeline = reportPipeline({ match: { ownerId }, bucket: 'day', timeZone: 'Asia/Dhaka', perFlipbook: false })
  assert.deepEqual(pipeline[0], { $match: { ownerId } })
  const facets = pipeline[1].$facet
  assert.deepEqual(Object.keys(facets).sort(), ['devices', 'flipbooks', 'series', 'sources', 'totals'])
  // Visitors are grouped and then only counted.
  for (const name of ['totals', 'flipbooks']) assert.deepEqual(facets[name].at(-1).$group.uniqueVisitors, { $sum: 1 })
  assert.doesNotMatch(JSON.stringify(facets.totals.at(-1)), /visitorId/)
  assert.equal(facets.series[0].$group._id.bucket.$dateToString.timezone, 'Asia/Dhaka')
  assert.ok(reportPipeline({ match: {}, bucket: 'month', timeZone: 'UTC', perFlipbook: true })[1].$facet.pages)
})

test('an empty dataset reads as zeros on every day of the period', () => {
  const now = new Date('2026-10-17T12:00:00Z')
  const window = reportWindow('7d', 'UTC', now)
  const report = shapeReport([{ totals: [], series: [], devices: [], sources: [] }], { range: '7d', timeZone: 'UTC', now, keys: window.keys })
  assert.deepEqual(report.totals, { views: 0, uniqueVisitors: 0, averagePagesPerView: 0 })
  assert.equal(report.series.points.length, 7)
  assert.ok(report.series.points.every((point) => point.views === 0 && point.uniqueVisitors === 0))
  assert.deepEqual(report.devices, { desktop: 0, mobile: 0, tablet: 0 })
  assert.deepEqual(report.sources, [])
  assert.deepEqual(shapeReport(undefined, { range: 'all', timeZone: 'UTC', now, keys: null }).series.points, [{ date: '2026-10', views: 0, uniqueVisitors: 0 }])
})

test('report figures: averages, devices, sources and the flipbook list, most viewed first', () => {
  const now = new Date('2026-10-17T12:00:00Z')
  const result = [
    {
      totals: [{ _id: null, views: 4, uniqueVisitors: 3, pagesShown: 10 }],
      series: [{ _id: '2026-10-17', views: 4, uniqueVisitors: 3 }],
      devices: [{ _id: 'mobile', views: 3 }, { _id: 'desktop', views: 1 }],
      sources: [{ _id: { host: null, embedded: false }, views: 2 }, { _id: { host: 'agency.example', embedded: true }, views: 2 }],
    },
  ]
  const report = shapeReport(result, { range: '7d', timeZone: 'UTC', now, keys: reportWindow('7d', 'UTC', now).keys })
  assert.deepEqual(report.totals, { views: 4, uniqueVisitors: 3, averagePagesPerView: 2.5 })
  assert.equal(report.series.points.at(-1).views, 4)
  assert.deepEqual(report.devices, { desktop: 1, mobile: 3, tablet: 0 })
  assert.deepEqual(report.sources, [{ host: null, embedded: false, views: 2 }, { host: 'agency.example', embedded: true, views: 2 }])

  const quiet = { _id: new mongoose.Types.ObjectId(), title: 'Quiet', slug: 'quiet-ab12', status: 'ready', isPublished: false }
  const popular = { _id: new mongoose.Types.ObjectId(), title: 'Popular', slug: 'popular-cd34', status: 'ready', isPublished: true }
  const rows = shapeFlipbookRows([quiet, popular], [{ _id: popular._id, views: 5, uniqueVisitors: 4, pagesShown: 12, lastViewedAt: now }])
  assert.deepEqual(rows.map((row) => row.title), ['Popular', 'Quiet'])
  assert.deepEqual(rows[0], { id: String(popular._id), title: 'Popular', slug: 'popular-cd34', isPublished: true, views: 5, uniqueVisitors: 4, averagePagesPerView: 2.4, lastViewedAt: now })
  assert.equal(rows[1].views, 0)
  assert.equal(rows[1].lastViewedAt, null)
})
