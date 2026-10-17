import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { aggregateResult: [], flipbooks: [], flipbook: null }
const viewSessionModel = { aggregate: mock.fn(async () => state.aggregateResult) }
const flipbookModel = {
  find: mock.fn(() => ({ select: () => ({ limit: async () => state.flipbooks }) })),
  findOne: mock.fn((filter) => ({
    select: async () => (state.flipbook && String(state.flipbook.ownerId) === String(filter.ownerId) && String(state.flipbook._id) === String(filter._id) ? state.flipbook : null),
  })),
}

// Tests pick the signed-in user with this header; the real requireAuth is covered in analyticsRoutesAuth.test.js.
mock.module(moduleUrl('../middleware/requireAuth.js'), {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(req.headers['x-test-user']) }
      next()
    },
  },
})
mock.module(moduleUrl('../models/ViewSession.js'), { defaultExport: viewSessionModel })
mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: flipbookModel })

const { default: analyticsRoutes } = await import('../routes/analyticsRoutes.js')
const { notFound, errorHandler } = await import('../middleware/errorHandler.js')

const app = express()
app.use('/api/analytics', analyticsRoutes)
app.use(notFound)
app.use(errorHandler)
const server = await startServer(app)
test.after(() => server.close())

const newId = () => new mongoose.Types.ObjectId().toString()

function report(userId, query = '') {
  return fetch(`${server.url}/api/analytics${query}`, { headers: { 'x-test-user': userId } })
}

function flipbookReport(userId, flipbookId, query = '') {
  return fetch(`${server.url}/api/analytics/flipbooks/${flipbookId}${query}`, { headers: { 'x-test-user': userId } })
}

beforeEach(() => {
  state.aggregateResult = []
  state.flipbooks = []
  state.flipbook = null
  viewSessionModel.aggregate.mock.resetCalls()
  flipbookModel.find.mock.resetCalls()
  flipbookModel.findOne.mock.resetCalls()
})

test("the account report covers only the signed-in owner's flipbooks, whatever the query says", async () => {
  const userId = newId()
  const response = await report(userId, `?range=7d&tz=Asia%2FDhaka&ownerId=${newId()}`)
  assert.equal(response.status, 200)
  const [pipeline] = viewSessionModel.aggregate.mock.calls[0].arguments
  const match = pipeline[0].$match
  assert.equal(String(match.ownerId), userId)
  assert.ok(match.startedAt.$gte instanceof Date)
  const [flipbookFilter] = flipbookModel.find.mock.calls[0].arguments
  assert.equal(String(flipbookFilter.ownerId), userId)
  assert.deepEqual(flipbookFilter.status, { $ne: 'deleting' })
})

test('an account without any views gets zeros, a full chart and its flipbooks listed at zero', async () => {
  const flipbookId = new mongoose.Types.ObjectId()
  state.flipbooks = [{ _id: flipbookId, title: 'Riverside Homes', slug: 'riverside-ab12', status: 'ready', isPublished: true }]
  const response = await report(newId(), '?range=30d')
  const { data } = await response.json()
  assert.equal(data.range, '30d')
  assert.equal(data.timeZone, 'UTC')
  assert.deepEqual(data.totals, { views: 0, uniqueVisitors: 0, averagePagesPerView: 0 })
  assert.equal(data.series.points.length, 30)
  assert.equal(data.flipbooks.length, 1)
  assert.equal(data.flipbooks[0].views, 0)
  assert.equal(data.flipbooks[0].isPublished, true)
})

test('the account report merges the counts into the flipbook list, most viewed first, with no visitor data', async () => {
  const popular = new mongoose.Types.ObjectId()
  const quiet = new mongoose.Types.ObjectId()
  state.flipbooks = [
    { _id: quiet, title: 'Quiet', slug: 'quiet-ab12', status: 'ready', isPublished: false },
    { _id: popular, title: 'Popular', slug: 'popular-cd34', status: 'ready', isPublished: true },
  ]
  state.aggregateResult = [
    {
      totals: [{ _id: null, views: 3, uniqueVisitors: 2, pagesShown: 9 }],
      series: [],
      devices: [{ _id: 'mobile', views: 3 }],
      sources: [{ _id: { host: 'agency.example', embedded: true }, views: 3 }],
      flipbooks: [{ _id: popular, views: 3, uniqueVisitors: 2, pagesShown: 9, lastViewedAt: new Date('2026-10-17T09:00:00Z') }],
    },
  ]
  const response = await report(newId(), '?range=all')
  const text = await response.text()
  assert.doesNotMatch(text, /visitorId|0f8fad5b|ownerId|publicId|userAgent|\bip\b/)
  const { data } = JSON.parse(text)
  assert.deepEqual(data.totals, { views: 3, uniqueVisitors: 2, averagePagesPerView: 3 })
  assert.equal(data.series.bucket, 'month')
  assert.deepEqual(data.flipbooks.map((row) => [row.title, row.views]), [['Popular', 3], ['Quiet', 0]])
  assert.deepEqual(data.sources, [{ host: 'agency.example', embedded: true, views: 3 }])
  // All time has no lower bound.
  assert.equal(viewSessionModel.aggregate.mock.calls[0].arguments[0][0].$match.startedAt, undefined)
})

test('invalid periods and time zones are refused before any query', async () => {
  for (const query of ['?range=365d', '?range=', '?tz=Mars%2FOlympus', '?tz=UTC%3B', '?range=7d&range=30d']) {
    const response = await report(newId(), query)
    assert.equal(response.status, 400, query)
    assert.equal((await response.json()).success, false)
  }
  assert.equal(viewSessionModel.aggregate.mock.callCount(), 0)
})

test("a flipbook report is only for the owner's own flipbook; others and invalid IDs get 404", async () => {
  const ownerId = newId()
  state.flipbook = { _id: new mongoose.Types.ObjectId(), ownerId, title: 'Riverside Homes', slug: 'riverside-ab12', status: 'ready', isPublished: true, pageCount: 4 }
  state.aggregateResult = [
    {
      totals: [{ _id: null, views: 2, uniqueVisitors: 1, pagesShown: 5 }],
      series: [],
      devices: [],
      sources: [],
      pages: [{ _id: 1, views: 2 }, { _id: 3, views: 1 }, { _id: 9, views: 1 }],
    },
  ]
  const response = await flipbookReport(ownerId, state.flipbook._id, '?range=7d')
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.deepEqual(data.flipbook, { id: String(state.flipbook._id), title: 'Riverside Homes', slug: 'riverside-ab12', isPublished: true, pageCount: 4 })
  // Pages outside the book (stored before a re-conversion, say) are left out.
  assert.deepEqual(data.pages, [{ pageNumber: 1, views: 2 }, { pageNumber: 3, views: 1 }])
  const match = viewSessionModel.aggregate.mock.calls[0].arguments[0][0].$match
  assert.equal(String(match.flipbookId), String(state.flipbook._id))
  assert.equal(String(match.ownerId), ownerId)

  assert.equal((await flipbookReport(newId(), state.flipbook._id)).status, 404)
  assert.equal((await flipbookReport(ownerId, 'not-an-id')).status, 404)
  assert.equal((await flipbookReport(ownerId, state.flipbook._id, '?range=1y')).status, 400)
  assert.equal(viewSessionModel.aggregate.mock.callCount(), 1)
})

test('a database failure is a structured 500 without details', async () => {
  viewSessionModel.aggregate.mock.mockImplementationOnce(async () => {
    throw new Error('MongoServerError: secret connection details')
  })
  const response = await report(newId())
  assert.equal(response.status, 500)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.doesNotMatch(JSON.stringify(body), /secret|MongoServerError/)
})
