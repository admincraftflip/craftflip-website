import { getApiErrorMessage } from './apiErrors.js'

// The owner's analytics dashboard (Milestone 10): loading reports and turning them into what the
// dashboard shows, kept free of React so it can be tested on its own. Definitions of views, unique
// visitors and page views are in REFERENCE.md, "Analytics".

export const RANGE_OPTIONS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
]
export const DEFAULT_RANGE = '30d'

// The owner's own time zone, so "today" in the chart matches their calendar.
export function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function getReport(request) {
  try {
    const response = await request()
    return { ok: true, data: response.data.data }
  } catch (error) {
    return { ok: false, missing: error.response?.status === 404, message: getApiErrorMessage(error) }
  }
}

export function loadAccountReport(client, range, timeZone) {
  return getReport(() => client.get('/api/analytics', { params: { range, tz: timeZone } }))
}

export function loadFlipbookReport(client, flipbookId, range, timeZone) {
  return getReport(() => client.get(`/api/analytics/flipbooks/${flipbookId}`, { params: { range, tz: timeZone } }))
}

// loading, error, empty (no views in the period) or ready.
export function reportState({ loading, error, data }) {
  if (loading && !data) return 'loading'
  if (error && !data) return 'error'
  if (!data) return 'loading'
  return data.totals.views === 0 ? 'empty' : 'ready'
}

// 1,284 / 12.9K / 1.2M: exact below 10,000, compact above.
export function formatCount(value, locale) {
  const number = Number(value) || 0
  if (Math.abs(number) < 10_000) return new Intl.NumberFormat(locale).format(number)
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(number)
}

// Chart and tooltip labels for a bucket key: "17 Oct" for a day, "Oct 2026" for a month. Keys are
// calendar dates already in the owner's time zone, so they are formatted as UTC dates.
export function bucketLabel(key, bucket, locale, { long = false } = {}) {
  const [year, month, day = 1] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const options = bucket === 'month' ? { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: long ? 'long' : 'short', ...(long ? { weekday: 'short', year: 'numeric' } : {}), timeZone: 'UTC' }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

// A clean axis for counts: a top value and ticks on round steps (1, 2 or 5 x a power of ten),
// at least 0-4 so an almost empty chart does not exaggerate one or two views.
export function niceScale(maxValue, tickCount = 4) {
  const target = Math.max(4, Math.ceil(Number(maxValue) || 0))
  const rough = target / tickCount
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough)
  const top = Math.ceil(target / step) * step
  const ticks = []
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value))
  return { max: top, ticks }
}

// Column positions for the views chart in a width x height plot area: one column per bucket,
// at most 24px thick, a 2px gap between neighbours, growing from the baseline. hit is the full
// slot, so even thin columns are easy to hover or tap.
export function columnLayout(points, { width, height, maxValue }) {
  const count = Math.max(points.length, 1)
  const slot = width / count
  const barWidth = Math.max(1, Math.min(24, slot - 2))
  return points.map((point, index) => {
    const barHeight = maxValue > 0 ? (point.views / maxValue) * height : 0
    const x = index * slot + (slot - barWidth) / 2
    return { ...point, x, width: barWidth, y: height - barHeight, height: barHeight, hitX: index * slot, hitWidth: slot }
  })
}

// Which x-axis labels to print so they never collide: about one every 60px, always the last one.
export function labelIndexes(count, width, minSpacing = 60) {
  if (count === 0) return []
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / minSpacing))))
  const indexes = []
  for (let index = count - 1; index >= 0; index -= every) indexes.unshift(index)
  return indexes
}

export function sourceLabel(source) {
  if (source.embedded) return source.host ? `Embedded on ${source.host}` : 'Embedded on a website'
  return source.host ?? 'Direct or unknown'
}

const DEVICE_LABELS = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }

// Devices as shares of all views, largest first; percentages are whole numbers.
export function deviceShares(devices) {
  const entries = Object.entries(DEVICE_LABELS).map(([type, label]) => ({ type, label, views: devices?.[type] ?? 0 }))
  const total = entries.reduce((sum, entry) => sum + entry.views, 0)
  return entries
    .map((entry) => ({ ...entry, percent: total > 0 ? Math.round((entry.views / total) * 100) : 0 }))
    .sort((first, second) => second.views - first.views)
}

// "2 hours ago" style text for the last view.
export function lastViewedLabel(isoDate, now = new Date(), locale) {
  if (!isoDate) return 'No views yet'
  const seconds = Math.round((new Date(isoDate).getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return 'Just now'
}
