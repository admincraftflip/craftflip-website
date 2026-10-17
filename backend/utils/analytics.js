// Flipbook analytics (Milestone 10): how activity reports from the public viewer are checked and
// stored, and how the owner's reports are built. Kept free of Express so it can be tested alone.
//
// Definitions (also in REFERENCE.md, "Analytics"):
// - A view is one reading session: a visitor opening a published flipbook. Reloads and further
//   reports from the same visitor within VIEW_SESSION_GAP_MS of their last activity continue the
//   same view; after a longer pause a new view starts.
// - A unique visitor is one random first-party visitor ID (one browser, or one embedding site in
//   browsers that partition storage) with at least one view in the period.
// - A page view counts the views in which a page was on screen for at least a moment; turning
//   back to a page within the same view does not count it again.

export const VIEW_SESSION_GAP_MS = 30 * 60 * 1000
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_PAGES_PER_REPORT = 50
const MAX_REFERRER_LENGTH = 2048
const ACTIVITY_FIELDS = ['visitorId', 'pages', 'referrer', 'embedded']

// ---------- Activity reports from the public viewer ----------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Only the host of an http(s) referrer is kept ("www." removed), never the path or query, which
// can carry personal data. Anything else is unknown (null).
export function referrerHost(referrer) {
  if (typeof referrer !== 'string' || !referrer || referrer.length > MAX_REFERRER_LENGTH) return null
  try {
    const url = new URL(referrer)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null
    return url.hostname.toLowerCase().replace(/^www\./, '').slice(0, 253)
  } catch {
    return null
  }
}

// { visitorId, pages, referrerHost, embedded } from a report body, or { error }. Pages beyond the
// flipbook's length are refused; the list is de-duplicated and sorted.
export function parseActivity(body, pageCount) {
  if (!isPlainObject(body) || Object.keys(body).some((key) => !ACTIVITY_FIELDS.includes(key))) return { error: 'Invalid activity report.' }
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId.toLowerCase() : ''
  if (!VISITOR_ID.test(visitorId)) return { error: 'Invalid activity report.' }
  const pages = body.pages ?? []
  if (!Array.isArray(pages) || pages.length > MAX_PAGES_PER_REPORT) return { error: 'Invalid activity report.' }
  if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) return { error: 'Invalid activity report.' }
  if (body.embedded !== undefined && typeof body.embedded !== 'boolean') return { error: 'Invalid activity report.' }
  if (body.referrer !== undefined && body.referrer !== null && typeof body.referrer !== 'string') return { error: 'Invalid activity report.' }
  return {
    visitorId,
    pages: [...new Set(pages)].sort((first, second) => first - second),
    referrerHost: referrerHost(body.referrer),
    embedded: body.embedded === true,
  }
}

// Crawlers, link-preview fetchers and headless tools are not visitors. They rarely run the viewer's
// script at all; this catches those that do, and requests without any user agent.
const BOT_USER_AGENT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http-client/i

export function isLikelyBot(userAgent) {
  return typeof userAgent !== 'string' || userAgent.trim() === '' || BOT_USER_AGENT.test(userAgent)
}

// Device class from the user agent, read once and not stored.
export function deviceTypeFrom(userAgent) {
  const agent = typeof userAgent === 'string' ? userAgent : ''
  if (/ipad|tablet|kindle|silk|playbook/i.test(agent) || (/android/i.test(agent) && !/mobile/i.test(agent))) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(agent)) return 'mobile'
  return 'desktop'
}

// The single atomic update that records a report: continue the visitor's open session (activity
// within the gap) or start a new one. The equality fields of the filter (flipbookId, visitorId)
// are copied into a new session by MongoDB.
export function sessionUpsert({ flipbook, activity, deviceType, now }) {
  return {
    filter: { flipbookId: flipbook._id, visitorId: activity.visitorId, lastSeenAt: { $gte: new Date(now.getTime() - VIEW_SESSION_GAP_MS) } },
    update: {
      $set: { lastSeenAt: now },
      $addToSet: { pagesViewed: { $each: activity.pages } },
      $setOnInsert: {
        ownerId: flipbook.ownerId,
        startedAt: now,
        deviceType,
        referrerHost: activity.referrerHost,
        embedded: activity.embedded,
        country: null,
      },
    },
    options: { upsert: true, sort: { lastSeenAt: -1 }, projection: { _id: 1 } },
  }
}

// ---------- Owner reports ----------

// Periods the owner can choose. Day buckets for the rolling periods, month buckets for all time.
export const ANALYTICS_RANGES = {
  '7d': { days: 7, bucket: 'day' },
  '30d': { days: 30, bucket: 'day' },
  '90d': { days: 90, bucket: 'day' },
  all: { days: null, bucket: 'month' },
}
export const DEFAULT_RANGE = '30d'

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(timeZone)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

// { range, timeZone } from the query string, or { error }. Days are counted in the owner's time
// zone (sent by the dashboard), so "today" matches their calendar; UTC when none is given.
export function parseReportQuery(query) {
  const range = query?.range ?? DEFAULT_RANGE
  const timeZone = query?.tz ?? 'UTC'
  if (typeof range !== 'string' || !Object.hasOwn(ANALYTICS_RANGES, range)) return { error: 'Choose a period: 7d, 30d, 90d or all.' }
  if (!isValidTimeZone(timeZone)) return { error: 'Invalid time zone.' }
  return { range, timeZone }
}

function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )
  return parts
}

// Minutes the zone is ahead of UTC at that instant (negative west of Greenwich).
function zoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// The instant local midnight starts on the zone's calendar day containing date. Daylight-saving
// changes are handled by re-checking the offset at the guessed midnight.
export function zonedStartOfDay(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone)
  const midnightAsUtc = Date.UTC(year, month - 1, day)
  const guess = midnightAsUtc - zoneOffsetMs(date, timeZone)
  return new Date(midnightAsUtc - zoneOffsetMs(new Date(guess), timeZone))
}

export function dayKey(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// The period's start (null for all time) and the bucket keys the chart shows, oldest first: every
// day of the period including today, so days without views show as zero.
export function reportWindow(range, timeZone, now = new Date()) {
  const { days, bucket } = ANALYTICS_RANGES[range]
  if (!days) return { from: null, bucket, keys: null }
  const { year, month, day } = zonedParts(now, timeZone)
  const keys = []
  for (let offset = days - 1; offset >= 0; offset--) {
    // Noon UTC of each calendar day, read back as a date: safe across daylight-saving changes.
    keys.push(new Date(Date.UTC(year, month - 1, day - offset, 12)).toISOString().slice(0, 10))
  }
  const [firstYear, firstMonth, firstDay] = keys[0].split('-').map(Number)
  const from = zonedStartOfDay(new Date(Date.UTC(firstYear, firstMonth - 1, firstDay, 12)), timeZone)
  return { from, bucket, keys }
}

// Month keys from the first month with data to the current one (all-time chart).
export function monthKeys(firstKey, now, timeZone) {
  const { year, month } = zonedParts(now, timeZone)
  const last = `${year}-${String(month).padStart(2, '0')}`
  if (!firstKey || firstKey > last) return [last]
  const keys = []
  let [y, m] = firstKey.split('-').map(Number)
  while (keys.length < 600) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    keys.push(key)
    if (key === last) break
    m += 1
    if (m === 13) {
      m = 1
      y += 1
    }
  }
  return keys
}

// The chart series: one point per key, zero where there were no views.
export function fillSeries(keys, rows) {
  const byKey = new Map(rows.map((row) => [row._id, row]))
  return keys.map((key) => ({ date: key, views: byKey.get(key)?.views ?? 0, uniqueVisitors: byKey.get(key)?.uniqueVisitors ?? 0 }))
}

// All report figures in one aggregation, for an owner (account report) or one of their flipbooks.
// Unique visitors are counted by grouping on visitorId first, so no visitor list is ever built in
// memory or returned.
export function reportPipeline({ match, bucket, timeZone, perFlipbook }) {
  const format = bucket === 'month' ? '%Y-%m' : '%Y-%m-%d'
  const facets = {
    totals: [
      { $group: { _id: '$visitorId', views: { $sum: 1 }, pagesShown: { $sum: { $size: '$pagesViewed' } } } },
      { $group: { _id: null, views: { $sum: '$views' }, uniqueVisitors: { $sum: 1 }, pagesShown: { $sum: '$pagesShown' } } },
    ],
    series: [
      { $group: { _id: { bucket: { $dateToString: { format, date: '$startedAt', timezone: timeZone } }, visitor: '$visitorId' }, views: { $sum: 1 } } },
      { $group: { _id: '$_id.bucket', views: { $sum: '$views' }, uniqueVisitors: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ],
    devices: [{ $group: { _id: '$deviceType', views: { $sum: 1 } } }],
    sources: [
      { $group: { _id: { host: '$referrerHost', embedded: '$embedded' }, views: { $sum: 1 } } },
      { $sort: { views: -1, '_id.host': 1 } },
      { $limit: 8 },
    ],
  }
  if (perFlipbook) {
    facets.pages = [{ $unwind: '$pagesViewed' }, { $group: { _id: '$pagesViewed', views: { $sum: 1 } } }, { $sort: { _id: 1 } }]
  } else {
    facets.flipbooks = [
      { $group: { _id: { flipbook: '$flipbookId', visitor: '$visitorId' }, views: { $sum: 1 }, pagesShown: { $sum: { $size: '$pagesViewed' } }, lastViewedAt: { $max: '$lastSeenAt' } } },
      {
        $group: {
          _id: '$_id.flipbook',
          views: { $sum: '$views' },
          uniqueVisitors: { $sum: 1 },
          pagesShown: { $sum: '$pagesShown' },
          lastViewedAt: { $max: '$lastViewedAt' },
        },
      },
    ]
  }
  return [{ $match: match }, { $facet: facets }]
}

function averagePages(pagesShown, views) {
  return views > 0 ? Math.round((pagesShown / views) * 10) / 10 : 0
}

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet']

// Turns the aggregation result into the response: totals, the chart series, devices and sources,
// and either the per-page counts (one flipbook) or nothing more (the controller adds flipbooks).
export function shapeReport(result, { range, timeZone, now, keys }) {
  const facet = result?.[0] ?? {}
  const totals = facet.totals?.[0] ?? { views: 0, uniqueVisitors: 0, pagesShown: 0 }
  const seriesRows = facet.series ?? []
  const seriesKeys = keys ?? monthKeys(seriesRows[0]?._id, now, timeZone)
  const devices = Object.fromEntries(DEVICE_TYPES.map((type) => [type, facet.devices?.find((row) => row._id === type)?.views ?? 0]))
  return {
    range,
    timeZone,
    totals: { views: totals.views, uniqueVisitors: totals.uniqueVisitors, averagePagesPerView: averagePages(totals.pagesShown, totals.views) },
    series: { bucket: ANALYTICS_RANGES[range].bucket, points: fillSeries(seriesKeys, seriesRows) },
    devices,
    sources: (facet.sources ?? []).map((row) => ({ host: row._id.host ?? null, embedded: row._id.embedded === true, views: row.views })),
  }
}

export function shapeFlipbookRows(flipbooks, rows) {
  const byId = new Map((rows ?? []).map((row) => [String(row._id), row]))
  return flipbooks
    .map((flipbook) => {
      const row = byId.get(String(flipbook._id))
      return {
        id: String(flipbook._id),
        title: flipbook.title,
        slug: flipbook.slug,
        isPublished: flipbook.status === 'ready' && flipbook.isPublished === true,
        views: row?.views ?? 0,
        uniqueVisitors: row?.uniqueVisitors ?? 0,
        averagePagesPerView: averagePages(row?.pagesShown ?? 0, row?.views ?? 0),
        lastViewedAt: row?.lastViewedAt ?? null,
      }
    })
    .sort((first, second) => second.views - first.views || second.uniqueVisitors - first.uniqueVisitors || first.title.localeCompare(second.title))
}
