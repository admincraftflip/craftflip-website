import mongoose from 'mongoose'
import Flipbook from '../models/Flipbook.js'
import ViewSession from '../models/ViewSession.js'
import { parseReportQuery, reportPipeline, reportWindow, shapeFlipbookRows, shapeReport } from '../utils/analytics.js'

// The owner's analytics (Milestone 10), behind requireAuth. Every query is filtered by the signed-in
// user's own ID (req.user, from the verified Firebase token), never by an ID from the request.
// Reports contain counts only: no visitor IDs, addresses or user agents.

const NOT_FOUND = { success: false, message: 'Flipbook not found.' }
// Account reports list at most this many flipbooks (the most viewed first).
const MAX_FLIPBOOK_ROWS = 200

function periodMatch(base, from) {
  return from ? { ...base, startedAt: { $gte: from } } : base
}

// GET /api/analytics?range=7d|30d|90d|all&tz=Area/City: totals, the chart, devices, sources and
// every flipbook of the account with its own figures (flipbooks without views included, at zero).
export async function getAccountAnalytics(req, res) {
  const query = parseReportQuery(req.query)
  if (query.error) return res.status(400).json({ success: false, message: query.error })
  const now = new Date()
  const window = reportWindow(query.range, query.timeZone, now)

  const [result, flipbooks] = await Promise.all([
    ViewSession.aggregate(reportPipeline({ match: periodMatch({ ownerId: req.user._id }, window.from), bucket: window.bucket, timeZone: query.timeZone, perFlipbook: false })),
    Flipbook.find({ ownerId: req.user._id, status: { $ne: 'deleting' } }).select('title slug status isPublished').limit(1000),
  ])

  const report = shapeReport(result, { range: query.range, timeZone: query.timeZone, now, keys: window.keys })
  const rows = shapeFlipbookRows(flipbooks, result?.[0]?.flipbooks).slice(0, MAX_FLIPBOOK_ROWS)
  res.json({ success: true, data: { ...report, from: window.from, to: now, flipbooks: rows } })
}

// GET /api/analytics/flipbooks/:id: the same for one of the owner's flipbooks, with the number of
// views in which each page was shown.
export async function getFlipbookAnalytics(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(404).json(NOT_FOUND)
  const query = parseReportQuery(req.query)
  if (query.error) return res.status(400).json({ success: false, message: query.error })

  const flipbook = await Flipbook.findOne({ _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } }).select('title slug status isPublished pageCount')
  if (!flipbook) return res.status(404).json(NOT_FOUND)

  const now = new Date()
  const window = reportWindow(query.range, query.timeZone, now)
  const match = periodMatch({ flipbookId: flipbook._id, ownerId: req.user._id }, window.from)
  const result = await ViewSession.aggregate(reportPipeline({ match, bucket: window.bucket, timeZone: query.timeZone, perFlipbook: true }))
  const report = shapeReport(result, { range: query.range, timeZone: query.timeZone, now, keys: window.keys })
  const pageCount = flipbook.pageCount ?? 0
  const pages = (result?.[0]?.pages ?? []).filter((row) => row._id >= 1 && row._id <= pageCount).map((row) => ({ pageNumber: row._id, views: row.views }))

  res.json({
    success: true,
    data: {
      ...report,
      from: window.from,
      to: now,
      flipbook: { id: String(flipbook._id), title: flipbook.title, slug: flipbook.slug, isPublished: flipbook.status === 'ready' && flipbook.isPublished === true, pageCount },
      pages,
    },
  })
}
