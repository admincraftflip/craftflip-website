import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { makePdf } from './helpers/makePdf.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { cloudinaryConfigured: true, claimed: null, storedPdf: null, storedText: null, finalMatched: 1 }

const flipbookModel = {
  findOneAndUpdate: mock.fn(async () => state.claimed),
  updateOne: mock.fn(async () => ({ matchedCount: state.finalMatched })),
}
const flipbookTextModel = {
  updateOne: mock.fn(async () => ({ upsertedCount: 1 })),
  deleteOne: mock.fn(async () => ({ deletedCount: 1 })),
  findOne: mock.fn(() => ({ select: () => ({ lean: async () => state.storedText }) })),
}
const storage = { downloadPdf: mock.fn(async () => state.storedPdf) }

mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: flipbookModel })
mock.module(moduleUrl('../models/FlipbookText.js'), { defaultExport: flipbookTextModel })
mock.module(moduleUrl('../config/cloudinary.js'), { namedExports: { getCloudinary: () => (state.cloudinaryConfigured ? {} : null) } })
mock.module(moduleUrl('../utils/pdfStorage.js'), { namedExports: { downloadPdf: (...args) => storage.downloadPdf(...args) } })

// The real PDF worker reads the text of the generated PDF ("Page 1", "Page 2", ...).
const { ensureSearchText, forgetFlipbookText, saveFlipbookText, searchFlipbook, TEXT_LEASE_MS } = await import('../utils/textSearch.js')

function olderFlipbook(pageCount = 3) {
  return {
    _id: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    pageCount,
    pdfAsset: { publicId: 'craftflip/users/u/flipbooks/f/original.pdf' },
    conversion: { attemptId: 'attempt-1' },
  }
}

beforeEach(() => {
  state.cloudinaryConfigured = true
  state.claimed = null
  state.storedPdf = makePdf(3)
  state.storedText = null
  state.finalMatched = 1
  for (const fn of [...Object.values(flipbookModel), ...Object.values(flipbookTextModel), storage.downloadPdf]) fn.mock.resetCalls()
})

test('page text is stored per flipbook and attempt; a PDF without text stores nothing', async () => {
  const flipbook = olderFlipbook()
  assert.equal(await saveFlipbookText(flipbook, 'attempt-1', ['Welcome', '', 'Pricing']), 'ready')
  const [filter, update, options] = flipbookTextModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(filter, { flipbookId: flipbook._id })
  assert.deepEqual(update, { $set: { ownerId: flipbook.ownerId, attemptId: 'attempt-1', pages: ['Welcome', '', 'Pricing'], characters: 14 } })
  assert.deepEqual(options, { upsert: true })

  assert.equal(await saveFlipbookText(flipbook, 'attempt-1', ['', '']), 'empty')
  assert.deepEqual(flipbookTextModel.deleteOne.mock.calls[0].arguments[0], { flipbookId: flipbook._id })
  assert.equal(flipbookTextModel.updateOne.mock.callCount(), 1)
})

test('the text of an older flipbook is read from its stored PDF, claimed first and recorded for the same conversion', async () => {
  const flipbook = olderFlipbook()
  state.claimed = flipbook
  assert.equal(await ensureSearchText(flipbook._id), 'ready')

  const [claimFilter, claim, claimOptions] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(claimFilter.status, 'ready')
  assert.equal(claimFilter['textSearch.status'], null)
  assert.deepEqual(claimFilter['textSearch.attempts'], { $not: { $gte: 3 } })
  assert.ok(claimFilter['textSearch.leaseExpiresAt'].$not.$gt instanceof Date)
  assert.deepEqual(claim.$inc, { 'textSearch.attempts': 1 })
  assert.ok(claim.$set['textSearch.leaseExpiresAt'] - Date.now() > TEXT_LEASE_MS - 5000)
  assert.equal(claimOptions.projection.pages, undefined, 'the page list is not loaded')

  assert.equal(storage.downloadPdf.mock.calls[0].arguments[0], flipbook.pdfAsset.publicId)
  const [, textUpdate] = flipbookTextModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(textUpdate.$set.pages, ['Page 1', 'Page 2', 'Page 3'])
  assert.equal(textUpdate.$set.attemptId, 'attempt-1')

  const [recordFilter, record] = flipbookModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(recordFilter, { _id: flipbook._id, status: 'ready', 'conversion.attemptId': 'attempt-1', 'textSearch.status': null })
  assert.deepEqual(record, { $set: { 'textSearch.status': 'ready', 'textSearch.attemptId': 'attempt-1', 'textSearch.leaseExpiresAt': null } })
})

test('if the flipbook is deleted while its text is read, the stored text is removed again', async () => {
  const flipbook = olderFlipbook()
  state.claimed = flipbook
  state.finalMatched = 0
  assert.equal(await ensureSearchText(flipbook._id), 'not_needed')
  assert.deepEqual(flipbookTextModel.deleteOne.mock.calls[0].arguments[0], { flipbookId: flipbook._id, attemptId: 'attempt-1' })
})

test('a failed reading waits before the next attempt; nothing is read when not needed or not configured', async () => {
  const flipbook = olderFlipbook()
  state.claimed = flipbook
  state.storedPdf = Buffer.from('not a pdf')
  assert.equal(await ensureSearchText(flipbook._id), 'failed')
  const [filter, update] = flipbookModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(filter, { _id: flipbook._id })
  assert.ok(update.$set['textSearch.leaseExpiresAt'] > new Date())
  assert.equal(flipbookTextModel.updateOne.mock.callCount(), 0)

  state.claimed = null
  assert.equal(await ensureSearchText(flipbook._id), 'not_needed')
  state.cloudinaryConfigured = false
  assert.equal(await ensureSearchText(flipbook._id), 'not_configured')
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 2)
})

test('searching loads the stored text once, then searches it from memory', async () => {
  const flipbook = { _id: new mongoose.Types.ObjectId(), status: 'ready', textSearch: { status: 'ready', attemptId: 'attempt-2' } }
  state.storedText = { pages: ['Ocean view villa', 'Private pool and spa', 'Pool house'], characters: 46 }
  const first = await searchFlipbook(flipbook, 'Pool')
  assert.deepEqual(first, {
    status: 'ready',
    results: [
      { page: 2, before: 'Private ', match: 'pool', after: ' and spa' },
      { page: 3, before: '', match: 'Pool', after: ' house' },
    ],
    total: 2,
    limited: false,
  })
  assert.deepEqual(flipbookTextModel.findOne.mock.calls[0].arguments[0], { flipbookId: flipbook._id, attemptId: 'attempt-2' })
  assert.equal((await searchFlipbook(flipbook, 'villa')).total, 1)
  assert.equal(flipbookTextModel.findOne.mock.callCount(), 1)

  forgetFlipbookText(flipbook._id)
  await searchFlipbook(flipbook, 'villa')
  assert.equal(flipbookTextModel.findOne.mock.callCount(), 2)
})

test('short queries are refused; older flipbooks start their reading; flipbooks without text find nothing', async () => {
  const ready = { _id: new mongoose.Types.ObjectId(), status: 'ready', textSearch: { status: 'ready', attemptId: 'a' } }
  assert.deepEqual(await searchFlipbook(ready, ' p '), { error: 'Type at least 2 characters to search.' })

  const older = { _id: new mongoose.Types.ObjectId(), status: 'ready' }
  assert.deepEqual(await searchFlipbook(older, 'pool'), { status: 'preparing', results: [], total: 0, limited: false })
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 1)

  const scanned = { _id: new mongoose.Types.ObjectId(), status: 'ready', textSearch: { status: 'empty' } }
  assert.deepEqual(await searchFlipbook(scanned, 'pool'), { status: 'unavailable', results: [], total: 0, limited: false })
  // Recorded as ready but the text is gone: reported as unavailable rather than failing.
  state.storedText = null
  const missing = { _id: new mongoose.Types.ObjectId(), status: 'ready', textSearch: { status: 'ready', attemptId: 'gone' } }
  assert.equal((await searchFlipbook(missing, 'pool')).status, 'unavailable')
  assert.equal(flipbookTextModel.findOne.mock.callCount(), 1)
})
