import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { makePdf } from './helpers/makePdf.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { storedPdf: null, updateMatched: 1 }

const storage = {
  downloadPdf: mock.fn(async () => state.storedPdf),
  uploadPageImage: mock.fn(async (buffer, publicId) => ({ public_id: publicId, version: 7, format: 'webp', bytes: buffer.length })),
  deletePageImages: mock.fn(async () => {}),
}

const flipbookModel = {
  updateOne: mock.fn(async () => ({ matchedCount: state.updateMatched })),
  find: mock.fn(() => ({ select: async () => [] })),
}

mock.module(moduleUrl('../config/cloudinary.js'), { namedExports: { getCloudinary: () => ({}) } })
mock.module(moduleUrl('../utils/pdfStorage.js'), {
  namedExports: {
    downloadPdf: (...args) => storage.downloadPdf(...args),
    uploadPageImage: (...args) => storage.uploadPageImage(...args),
    deletePageImages: (...args) => storage.deletePageImages(...args),
    pageFolder: (userId, flipbookId, attemptId) => `craftflip/users/${userId}/flipbooks/${flipbookId}/pages/${attemptId}`,
    pagePublicId: (folder, pageNumber) => `${folder}/page-${String(pageNumber).padStart(3, '0')}`,
  },
})
mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: flipbookModel })
// The social preview image (Milestone 13) has its own tests in socialImage.test.js.
const socialImage = { ensureSocialImage: mock.fn(async () => 'created') }
mock.module(moduleUrl('../utils/socialImage.js'), { namedExports: { ensureSocialImage: (...args) => socialImage.ensureSocialImage(...args) } })

// Storing the text is covered in textSearch.test.js; here only what the conversion hands over.
const textSearch = {
  saveFlipbookText: mock.fn(async (flipbook, attemptId, texts) => (texts.some(Boolean) ? 'ready' : 'empty')),
  removeFlipbookText: mock.fn(async () => {}),
}
mock.module(moduleUrl('../utils/textSearch.js'), {
  namedExports: {
    saveFlipbookText: (...args) => textSearch.saveFlipbookText(...args),
    removeFlipbookText: (...args) => textSearch.removeFlipbookText(...args),
  },
})

const { runConversion, recoverInterruptedConversions, CONVERSION_MESSAGES } = await import('../utils/pdfConversion.js')

function claimedFlipbook() {
  return {
    _id: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    status: 'processing',
    pdfAsset: { publicId: 'original-public-id' },
    conversion: { attemptId: 'attempt-1' },
  }
}

function lastUpdate() {
  const calls = flipbookModel.updateOne.mock.calls
  const [filter, update] = calls[calls.length - 1].arguments
  return { filter, fields: update.$set }
}

beforeEach(() => {
  state.storedPdf = makePdf(3)
  state.updateMatched = 1
  for (const fn of [...Object.values(storage), ...Object.values(flipbookModel), socialImage.ensureSocialImage, ...Object.values(textSearch)]) fn.mock.resetCalls()
})

test('converts every page in order and records them on the flipbook', async () => {
  const flipbook = claimedFlipbook()
  await runConversion(flipbook, { maxPages: 100 })

  const { filter, fields } = lastUpdate()
  assert.deepEqual(filter, { _id: flipbook._id, status: 'processing', 'conversion.attemptId': 'attempt-1' })
  assert.equal(fields.status, 'ready')
  assert.equal(fields.pageCount, 3)
  assert.deepEqual(
    fields.pages.map((page) => page.pageNumber),
    [1, 2, 3]
  )
  const folder = `craftflip/users/${flipbook.ownerId}/flipbooks/${flipbook._id}/pages/attempt-1`
  assert.equal(fields.pages[0].publicId, `${folder}/page-001`)
  assert.equal(fields.pages[2].publicId, `${folder}/page-003`)
  assert.equal(fields.pages[0].width, 1600)
  assert.equal(fields.pages[0].format, 'webp')
  assert.equal(storage.deletePageImages.mock.callCount(), 0)
})

test('a ready flipbook starts its social preview image; failed and superseded conversions do not', async () => {
  const flipbook = claimedFlipbook()
  await runConversion(flipbook, { maxPages: 100 })
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 1)
  assert.equal(socialImage.ensureSocialImage.mock.calls[0].arguments[0], flipbook._id)

  socialImage.ensureSocialImage.mock.resetCalls()
  await runConversion(claimedFlipbook(), { maxPages: 2 })
  state.updateMatched = 0
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 0)
})

test('a social preview image that fails does not change a successful conversion', async () => {
  socialImage.ensureSocialImage.mock.mockImplementationOnce(async () => 'failed')
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  assert.equal(lastUpdate().fields.status, 'ready')
  assert.equal(storage.deletePageImages.mock.callCount(), 0)
})

test('a PDF over the plan page limit fails before any page is stored', async () => {
  await runConversion(claimedFlipbook(), { maxPages: 2 })

  const { fields } = lastUpdate()
  assert.equal(fields.status, 'failed')
  assert.equal(fields['conversion.error'], 'This PDF has 3 pages. Your plan allows up to 2 pages.')
  assert.equal(storage.uploadPageImage.mock.callCount(), 0)
})

test('a failure part-way through removes the pages already stored', async () => {
  const flipbook = claimedFlipbook()
  storage.uploadPageImage.mock.mockImplementation(async (buffer, publicId) => {
    if (publicId.endsWith('page-002')) throw Object.assign(new Error('upload failed'), { http_code: 500 })
    return { public_id: publicId, version: 1, format: 'webp', bytes: buffer.length }
  })
  try {
    await runConversion(flipbook, { maxPages: 100 })
  } finally {
    storage.uploadPageImage.mock.restore()
  }

  const { fields } = lastUpdate()
  assert.equal(fields.status, 'failed')
  assert.equal(fields['conversion.error'], CONVERSION_MESSAGES.generic)
  assert.deepEqual(fields.pages, [])
  assert.equal(storage.deletePageImages.mock.calls[0].arguments[0], `craftflip/users/${flipbook.ownerId}/flipbooks/${flipbook._id}/pages/attempt-1`)
})

test('a stored file that is not a PDF fails as unreadable', async () => {
  state.storedPdf = Buffer.from('not a pdf')
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  assert.equal(lastUpdate().fields['conversion.error'], CONVERSION_MESSAGES.unreadable)
})

test('a corrupt PDF fails as unreadable', async () => {
  state.storedPdf = Buffer.from('%PDF-1.4\ngarbage without objects')
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  assert.equal(lastUpdate().fields['conversion.error'], CONVERSION_MESSAGES.unreadable)
})

test('if the attempt was superseded, its page images are removed', async () => {
  state.updateMatched = 0
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  assert.equal(storage.deletePageImages.mock.callCount(), 1)
})

test('conversions interrupted by a restart are marked failed and cleaned up', async () => {
  const flipbook = claimedFlipbook()
  flipbookModel.find.mock.mockImplementationOnce(() => ({ select: async () => [flipbook] }))

  await recoverInterruptedConversions()

  const { filter, fields } = lastUpdate()
  assert.equal(filter['conversion.attemptId'], 'attempt-1')
  assert.equal(fields.status, 'failed')
  assert.equal(fields['conversion.error'], CONVERSION_MESSAGES.interrupted)
  assert.equal(storage.deletePageImages.mock.callCount(), 1)
})

const { renderAndStorePages, PAGE_CONCURRENCY } = await import('../utils/pdfConversion.js')

// A renderer whose pages take different times, so they finish out of order.
function fakeRenderer(pageCount, renderDelays = {}) {
  return {
    pageCount,
    renderPage: async (pageNumber) => {
      await new Promise((resolve) => setTimeout(resolve, renderDelays[pageNumber] ?? 1))
      return { data: Buffer.from(`page-${pageNumber}`), width: 1600, height: 2071 }
    },
  }
}

function trackUploads(delayFor = () => 1, failOn = null) {
  const tracker = { inFlight: 0, maxInFlight: 0, finishedOrder: [], settledAt: [] }
  storage.uploadPageImage.mock.mockImplementation(async (buffer, publicId) => {
    tracker.inFlight++
    tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight)
    const pageNumber = Number(publicId.slice(-3))
    try {
      await new Promise((resolve) => setTimeout(resolve, delayFor(pageNumber)))
      if (pageNumber === failOn) throw Object.assign(new Error('upload failed'), { http_code: 500 })
      tracker.finishedOrder.push(pageNumber)
      return { public_id: publicId, version: 1, format: 'webp', bytes: buffer.length }
    } finally {
      tracker.inFlight--
      tracker.settledAt.push(Date.now())
    }
  })
  return tracker
}

test('pages are converted with at most PAGE_CONCURRENCY in flight', async () => {
  const tracker = trackUploads(() => 15)
  try {
    const pages = await renderAndStorePages(fakeRenderer(12), 'folder', { isTimedOut: () => false, onPageDone: () => {} })
    assert.equal(pages.length, 12)
  } finally {
    storage.uploadPageImage.mock.restore()
  }
  assert.equal(PAGE_CONCURRENCY, 3)
  assert.equal(tracker.maxInFlight, PAGE_CONCURRENCY)
})

test('pages finishing out of order are stored in reading order with the right metadata', async () => {
  // Early pages are slow, later pages fast: completion order differs from page order.
  const tracker = trackUploads((pageNumber) => (pageNumber <= 3 ? 40 : 2))
  let pages
  try {
    pages = await renderAndStorePages(fakeRenderer(7, { 1: 30, 2: 20 }), 'folder', { isTimedOut: () => false, onPageDone: () => {} })
  } finally {
    storage.uploadPageImage.mock.restore()
  }
  assert.notDeepEqual(tracker.finishedOrder, [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(
    pages.map((page) => page.publicId),
    [1, 2, 3, 4, 5, 6, 7].map((number) => `folder/page-${String(number).padStart(3, '0')}`)
  )
})

test('completed pages are counted once each, never above the total, only after the upload succeeds', async () => {
  const counts = []
  const tracker = trackUploads((pageNumber) => (pageNumber % 2 ? 10 : 1))
  try {
    await renderAndStorePages(fakeRenderer(9), 'folder', {
      isTimedOut: () => false,
      onPageDone: (completed, total) => counts.push([completed, total, tracker.finishedOrder.length]),
    })
  } finally {
    storage.uploadPageImage.mock.restore()
  }
  assert.deepEqual(counts.map(([completed]) => completed), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.ok(counts.every(([completed, total, uploaded]) => total === 9 && completed <= uploaded))
})

test('a timeout stops new pages from starting', async () => {
  let checks = 0
  const tracker = trackUploads(() => 1)
  try {
    await assert.rejects(
      renderAndStorePages(fakeRenderer(10), 'folder', { isTimedOut: () => ++checks > 4, onPageDone: () => {} }),
      (error) => error.message === CONVERSION_MESSAGES.timeout
    )
  } finally {
    storage.uploadPageImage.mock.restore()
  }
  assert.ok(storage.uploadPageImage.mock.callCount() <= 4)
  assert.equal(tracker.inFlight, 0)
})

test('after a failed page no new page starts, and cleanup waits for uploads still in flight', async () => {
  const flipbook = claimedFlipbook()
  state.storedPdf = makePdf(8)
  const tracker = trackUploads((pageNumber) => (pageNumber === 2 ? 1 : 30), 2)
  let cleanupAt = null
  storage.deletePageImages.mock.mockImplementationOnce(async () => {
    cleanupAt = Date.now()
  })
  try {
    await runConversion(flipbook, { maxPages: 100 })
  } finally {
    storage.uploadPageImage.mock.restore()
  }

  const { fields } = lastUpdate()
  assert.equal(fields.status, 'failed')
  assert.deepEqual(fields.pages, [])
  assert.ok(storage.uploadPageImage.mock.callCount() < 8, 'pages after the failure were not started')
  assert.equal(tracker.inFlight, 0)
  assert.ok(cleanupAt >= Math.max(...tracker.settledAt), 'cleanup ran after every upload settled')
})

test('progress is saved per attempt, never moves backwards, and the flipbook is ready only after it', async () => {
  const flipbook = claimedFlipbook()
  state.storedPdf = makePdf(5)
  await runConversion(flipbook, { maxPages: 100 })

  const updates = flipbookModel.updateOne.mock.calls.map((call) => call.arguments)
  for (const [filter] of updates) {
    assert.deepEqual(filter, { _id: flipbook._id, status: 'processing', 'conversion.attemptId': 'attempt-1' })
  }
  const stages = updates.map(([, update]) => update.$set?.['conversion.stage']).filter(Boolean)
  assert.deepEqual(stages, ['preparing', 'converting', 'finalizing'])
  const converting = updates.find(([, update]) => update.$set?.['conversion.stage'] === 'converting')[1]
  assert.equal(converting.$set['conversion.totalPages'], 5)
  const counts = updates.map(([, update]) => update.$max?.['conversion.completedPages']).filter((value) => value !== undefined)
  assert.ok(counts.length >= 1)
  assert.deepEqual(counts, [...counts].sort((first, second) => first - second))
  assert.equal(counts.at(-1), 5)

  const readyIndex = updates.findIndex(([, update]) => update.$set?.status === 'ready')
  assert.equal(readyIndex, updates.length - 1, 'ready is the last write')
})

test('a failed progress write does not change the outcome of the conversion', async () => {
  flipbookModel.updateOne.mock.mockImplementation(async (filter, update) => {
    if (update.$max || update.$set?.['conversion.stage']) throw new Error('write conflict')
    return { matchedCount: state.updateMatched }
  })
  try {
    await runConversion(claimedFlipbook(), { maxPages: 100 })
  } finally {
    flipbookModel.updateOne.mock.restore()
  }
  assert.equal(lastUpdate().fields.status, 'ready')
})

const { queueConversion } = await import('../utils/pdfConversion.js')

test('the original still in memory from the upload is used without downloading it again', async () => {
  const flipbook = claimedFlipbook()
  await runConversion(flipbook, { maxPages: 100, pdf: makePdf(2) })
  assert.equal(storage.downloadPdf.mock.callCount(), 0)
  assert.equal(lastUpdate().fields.status, 'ready')
  assert.equal(lastUpdate().fields.pageCount, 2)
})

test('in-memory bytes that are not a PDF still fail as unreadable', async () => {
  await runConversion(claimedFlipbook(), { maxPages: 100, pdf: Buffer.from('not a pdf') })
  assert.equal(lastUpdate().fields['conversion.error'], CONVERSION_MESSAGES.unreadable)
  assert.equal(storage.downloadPdf.mock.callCount(), 0)
})

test('a job that has to wait in the queue drops the uploaded bytes and downloads the original later', async () => {
  let release
  const gate = new Promise((resolve) => (release = resolve))
  storage.uploadPageImage.mock.mockImplementation(async (buffer, publicId) => {
    await gate
    return { public_id: publicId, version: 1, format: 'webp', bytes: buffer.length }
  })
  state.storedPdf = makePdf(1)
  const first = claimedFlipbook()
  const second = { ...claimedFlipbook(), pdfAsset: { publicId: 'second-original' }, conversion: { attemptId: 'attempt-2' } }
  try {
    queueConversion(first, { maxPages: 100, pdf: makePdf(1) })
    queueConversion(second, { maxPages: 100, pdf: makePdf(1) })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(storage.downloadPdf.mock.callCount(), 0, 'the first job uses its bytes; the second has not started')
    release()

    const readyCount = () => flipbookModel.updateOne.mock.calls.filter((call) => call.arguments[1].$set?.status === 'ready').length
    for (let waited = 0; readyCount() < 2 && waited < 10000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(readyCount(), 2)
  } finally {
    storage.uploadPageImage.mock.restore()
  }
  assert.equal(storage.downloadPdf.mock.callCount(), 1)
  assert.equal(storage.downloadPdf.mock.calls[0].arguments[0], 'second-original')
})

test('the page text read while rendering is stored for search before the flipbook becomes Ready', async () => {
  const flipbook = claimedFlipbook()
  await runConversion(flipbook, { maxPages: 100 })
  const [savedFor, attemptId, texts] = textSearch.saveFlipbookText.mock.calls[0].arguments
  assert.equal(savedFor, flipbook)
  assert.equal(attemptId, 'attempt-1')
  assert.deepEqual(texts, ['Page 1', 'Page 2', 'Page 3'])
  const { fields } = lastUpdate()
  assert.deepEqual(fields.textSearch, { status: 'ready', attemptId: 'attempt-1', attempts: 0, leaseExpiresAt: null })
  assert.equal(fields.pages[0].text, undefined, 'the text is not stored in the page list')
  assert.equal(textSearch.removeFlipbookText.mock.callCount(), 0)
})

test('if the text cannot be stored the flipbook is still Ready, and a superseded attempt removes its text', async () => {
  textSearch.saveFlipbookText.mock.mockImplementationOnce(async () => {
    throw new Error('database unavailable')
  })
  await runConversion(claimedFlipbook(), { maxPages: 100 })
  let { fields } = lastUpdate()
  assert.equal(fields.status, 'ready')
  assert.deepEqual(fields.textSearch, { status: null, attemptId: null, attempts: 0, leaseExpiresAt: null })

  state.updateMatched = 0
  const superseded = claimedFlipbook()
  await runConversion(superseded, { maxPages: 100 })
  assert.deepEqual(textSearch.removeFlipbookText.mock.calls[0].arguments, [superseded._id, 'attempt-1'])
})
