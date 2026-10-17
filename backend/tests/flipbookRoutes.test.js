import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import mongoose from 'mongoose'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { cloudinaryConfigured: true, plan: 'free', queueFull: false, isRetired: () => false }

const storage = {
  uploadPdf: mock.fn(async (buffer, publicId) => ({ public_id: publicId, version: 1, resource_type: 'raw', type: 'authenticated' })),
  deletePdf: mock.fn(async () => {}),
  fetchPageImage: mock.fn(async () => Buffer.from('RIFF-page-image')),
  deleteFlipbookAssets: mock.fn(async () => {}),
  uploadLogoImage: mock.fn(async (buffer, publicId) => ({ public_id: publicId, version: 3, format: 'webp' })),
  deleteLogoImage: mock.fn(async () => {}),
  openOriginalPdfStream: mock.fn(async () => ({ stream: Readable.toWeb(Readable.from([Buffer.from('%PDF-1.4 original')])), contentLength: 17 })),
  openPageImageStream: mock.fn(async () => ({ stream: Readable.toWeb(Readable.from([Buffer.from('RIFF-logo')])), contentLength: 9 })),
}

const flipbookModel = {
  create: mock.fn(async (fields) => ({ ...fields, toSummary: () => ({ id: fields._id, title: fields.title }) })),
  find: mock.fn(() => ({ select: () => ({ sort: () => ({ limit: async () => [] }) }) })),
  findOne: mock.fn(() => ({ select: async () => null })),
  findOneAndUpdate: mock.fn(async () => null),
  deleteOne: mock.fn(async () => ({ deletedCount: 1 })),
}

const conversion = { queueConversion: mock.fn() }

class FakePublishError extends Error {
  constructor(status, message, details = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}
const publishing = {
  publishFlipbook: mock.fn(async () => ({ toSummary: () => ({ id: 'f', isPublished: true }) })),
  unpublishFlipbook: mock.fn(async () => ({ toSummary: () => ({ id: 'f', isPublished: false }) })),
  changeSlug: mock.fn(async (user, id, slug) => ({ toSummary: () => ({ id, slug }) })),
}

// Tests pick the signed-in user with this header; the real requireAuth is covered in requireAuth.test.js.
mock.module(moduleUrl('../middleware/requireAuth.js'), {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(req.headers['x-test-user']), plan: state.plan }
      next()
    },
  },
})
mock.module(moduleUrl('../config/cloudinary.js'), {
  namedExports: { getCloudinary: () => (state.cloudinaryConfigured ? {} : null) },
})
mock.module(moduleUrl('../utils/pdfStorage.js'), {
  namedExports: {
    uploadPdf: (...args) => storage.uploadPdf(...args),
    deletePdf: (...args) => storage.deletePdf(...args),
    fetchPageImage: (...args) => storage.fetchPageImage(...args),
    deleteFlipbookAssets: (...args) => storage.deleteFlipbookAssets(...args),
    uploadLogoImage: (...args) => storage.uploadLogoImage(...args),
    deleteLogoImage: (...args) => storage.deleteLogoImage(...args),
    openOriginalPdfStream: (...args) => storage.openOriginalPdfStream(...args),
    openPageImageStream: (...args) => storage.openPageImageStream(...args),
    brandingFolder: (userId, flipbookId) => `craftflip/users/${userId}/flipbooks/${flipbookId}/branding`,
    pdfPublicId: (userId, flipbookId) => `craftflip/users/${userId}/flipbooks/${flipbookId}/original.pdf`,
  },
})
const viewSessionModel = { deleteMany: mock.fn(async () => ({ deletedCount: 3 })) }
mock.module(moduleUrl('../models/ViewSession.js'), { defaultExport: viewSessionModel })
mock.module(moduleUrl('../models/Flipbook.js'), {
  defaultExport: flipbookModel,
  namedExports: { MAX_TITLE_LENGTH: 120, FLIPBOOK_STATUSES: ['uploaded', 'processing', 'ready', 'failed', 'deleting'] },
})

mock.module(moduleUrl('../utils/pdfConversion.js'), {
  namedExports: {
    queueConversion: (...args) => conversion.queueConversion(...args),
    conversionQueueIsFull: () => state.queueFull,
  },
})

mock.module(moduleUrl('../utils/publishing.js'), {
  namedExports: {
    PublishError: FakePublishError,
    isSlugRetired: async (slug) => state.isRetired(slug),
    publishedCountFor: async () => 2,
    publishFlipbook: (...args) => publishing.publishFlipbook(...args),
    unpublishFlipbook: (...args) => publishing.unpublishFlipbook(...args),
    changeSlug: (...args) => publishing.changeSlug(...args),
  },
})

const { default: flipbookRoutes } = await import('../routes/flipbookRoutes.js')
const { notFound, errorHandler } = await import('../middleware/errorHandler.js')

const app = express()
app.use(express.json())
app.use('/api/flipbooks', flipbookRoutes)
app.use(notFound)
app.use(errorHandler)
const server = await startServer(app)
test.after(() => server.close())

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

function newUserId() {
  return new mongoose.Types.ObjectId().toString()
}

function uploadRequest(userId, buffer, filename = 'brochure.pdf') {
  const form = new FormData()
  if (buffer) form.append('pdf', new Blob([buffer], { type: 'application/pdf' }), filename)
  return fetch(`${server.url}/api/flipbooks`, { method: 'POST', headers: { 'x-test-user': userId }, body: form })
}

beforeEach(() => {
  state.cloudinaryConfigured = true
  state.plan = 'free'
  state.queueFull = false
  conversion.queueConversion.mock.resetCalls()
  publishing.publishFlipbook.mock.resetCalls()
  publishing.unpublishFlipbook.mock.resetCalls()
  publishing.changeSlug.mock.resetCalls()
  flipbookModel.findOneAndUpdate.mock.resetCalls()
  storage.uploadPdf.mock.resetCalls()
  storage.deletePdf.mock.resetCalls()
  storage.fetchPageImage.mock.resetCalls()
  storage.deleteFlipbookAssets.mock.resetCalls()
  storage.uploadLogoImage.mock.resetCalls()
  storage.deleteLogoImage.mock.resetCalls()
  storage.openOriginalPdfStream.mock.resetCalls()
  flipbookModel.deleteOne.mock.resetCalls()
  flipbookModel.create.mock.resetCalls()
  flipbookModel.find.mock.resetCalls()
  flipbookModel.findOne.mock.resetCalls()
})

test('a genuine PDF is stored and recorded for the signed-in user', async () => {
  const userId = newUserId()
  const response = await uploadRequest(userId, PDF_BYTES, 'Boutique_Home Group.pdf')
  const body = await response.json()

  assert.equal(response.status, 201)
  assert.equal(body.success, true)
  assert.equal(body.data.flipbook.title, 'Boutique Home Group')
  const [fields] = flipbookModel.create.mock.calls[0].arguments
  assert.equal(fields.ownerId.toString(), userId)
  assert.equal(fields.originalFile.filename, 'Boutique_Home Group.pdf')
  assert.equal(fields.pdfAsset.deliveryType, 'authenticated')
})

test('a text file renamed to .pdf is rejected before reaching Cloudinary', async () => {
  const response = await uploadRequest(newUserId(), Buffer.from('just some text'), 'notes.pdf')
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { success: false, message: 'Only PDF files can be uploaded.' })
  assert.equal(storage.uploadPdf.mock.callCount(), 0)
})

test('a request without a file gets a structured 400', async () => {
  const response = await uploadRequest(newUserId(), null)
  assert.equal(response.status, 400)
  assert.equal((await response.json()).success, false)
})

test('files over 50 MB are rejected with 413', async () => {
  const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(50 * 1024 * 1024)])
  const response = await uploadRequest(newUserId(), oversized)
  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), { success: false, message: 'PDF files must be 50 MB or smaller.' })
  assert.equal(storage.uploadPdf.mock.callCount(), 0)
})

test('uploads return 503 when Cloudinary is not configured', async () => {
  state.cloudinaryConfigured = false
  const response = await uploadRequest(newUserId(), PDF_BYTES)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).success, false)
})

test('a Cloudinary failure creates no flipbook', async () => {
  storage.uploadPdf.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('Server error'), { http_code: 500 })
  })
  const response = await uploadRequest(newUserId(), PDF_BYTES)
  assert.equal(response.status, 502)
  assert.equal((await response.json()).success, false)
  assert.equal(flipbookModel.create.mock.callCount(), 0)
})

test("a file over the Cloudinary plan's size cap is reported as 413", async () => {
  storage.uploadPdf.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('File size too large. Got 11534345. Maximum is 10485760.'), { http_code: 400 })
  })
  const response = await uploadRequest(newUserId(), PDF_BYTES)
  assert.equal(response.status, 413)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.doesNotMatch(body.message, /10485760/)
})

test('if saving the flipbook fails, the uploaded Cloudinary asset is deleted', async () => {
  const userId = newUserId()
  flipbookModel.create.mock.mockImplementationOnce(async () => {
    throw new Error('MongoDB unavailable')
  })
  const response = await uploadRequest(userId, PDF_BYTES)

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { success: false, message: 'Something went wrong. Please try again.' })
  assert.equal(storage.deletePdf.mock.callCount(), 1)
  const [uploadedPublicId] = storage.uploadPdf.mock.calls[0].arguments.slice(1)
  assert.equal(storage.deletePdf.mock.calls[0].arguments[0], uploadedPublicId)
  assert.match(uploadedPublicId, new RegExp(`^craftflip/users/${userId}/flipbooks/`))
})

test('listing only queries the signed-in user\'s flipbooks', async () => {
  const userId = newUserId()
  const response = await fetch(`${server.url}/api/flipbooks`, { headers: { 'x-test-user': userId } })
  assert.equal(response.status, 200)
  const [filter] = flipbookModel.find.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
})

test("another user's flipbook returns the same 404 as a missing one", async () => {
  const userId = newUserId()
  const response = await fetch(`${server.url}/api/flipbooks/${newUserId()}`, { headers: { 'x-test-user': userId } })
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })
  const [filter] = flipbookModel.findOne.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)

  const invalidId = await fetch(`${server.url}/api/flipbooks/not-an-id`, { headers: { 'x-test-user': userId } })
  assert.equal(invalidId.status, 404)
})

test('uploads are rate limited per user with a structured 429', async () => {
  const userId = newUserId()
  for (let attempt = 1; attempt <= 20; attempt++) {
    assert.notEqual((await uploadRequest(userId, null)).status, 429)
  }
  const limited = await uploadRequest(userId, null)
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), { success: false, message: 'Upload limit reached. Please try again later.' })

  // The limit is per user: another user is unaffected.
  assert.equal((await uploadRequest(newUserId(), PDF_BYTES)).status, 201)
})

function convertRequest(userId, flipbookId) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/convert`, { method: 'POST', headers: { 'x-test-user': userId } })
}

test("starting a conversion claims only the user's own uploaded or failed flipbook", async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  state.plan = 'pro'
  const claimed = { _id: flipbookId, status: 'processing', toSummary: () => ({ id: flipbookId, status: 'processing' }) }
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => claimed)

  const response = await convertRequest(userId, flipbookId)
  assert.equal(response.status, 202)
  assert.equal((await response.json()).data.flipbook.status, 'processing')

  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $in: ['uploaded', 'failed'] })
  assert.equal(update.$set.status, 'processing')
  assert.ok(update.$set.conversion.attemptId)
  // A new attempt starts with fresh progress, so an earlier attempt's progress is never shown.
  assert.equal(update.$set.conversion.stage, 'queued')
  assert.equal(update.$set.conversion.completedPages, 0)
  assert.equal(update.$set.conversion.totalPages, null)

  const [queued, options] = conversion.queueConversion.mock.calls[0].arguments
  assert.equal(queued, claimed)
  assert.deepEqual(options, { maxPages: 200 })
})

test('a conversion already running or finished is refused with 409', async () => {
  for (const status of ['processing', 'ready']) {
    flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ status }) }))
    const response = await convertRequest(newUserId(), newUserId())
    assert.equal(response.status, 409)
    assert.equal((await response.json()).success, false)
  }
  assert.equal(conversion.queueConversion.mock.callCount(), 0)
})

test("converting another user's or a missing flipbook returns 404", async () => {
  const response = await convertRequest(newUserId(), newUserId())
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })

  assert.equal((await convertRequest(newUserId(), 'not-an-id')).status, 404)
  assert.equal(conversion.queueConversion.mock.callCount(), 0)
})

test('a full conversion queue returns 503 without claiming the flipbook', async () => {
  state.queueFull = true
  const response = await convertRequest(newUserId(), newUserId())
  assert.equal(response.status, 503)
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

test('conversion returns 503 when Cloudinary is not configured', async () => {
  state.cloudinaryConfigured = false
  const response = await convertRequest(newUserId(), newUserId())
  assert.equal(response.status, 503)
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

const STORED_PAGES = [
  { pageNumber: 2, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-002', version: 7, format: 'webp', width: 1600, height: 2263, bytes: 900 },
  { pageNumber: 1, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-001', version: 7, format: 'webp', width: 1600, height: 2263, bytes: 800 },
]

function storedFlipbook(status, pages = STORED_PAGES) {
  return { status, pages, toSummary: () => ({ id: 'f', status, pageCount: status === 'ready' ? pages.length : null }) }
}

function pagesRequest(userId, flipbookId) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/pages`, { headers: { 'x-test-user': userId } })
}

function pageImageRequest(userId, flipbookId, pageNumber) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/pages/${pageNumber}/image`, { headers: { 'x-test-user': userId } })
}

test('the page list returns ordered page sizes without any Cloudinary details', async () => {
  const userId = newUserId()
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => storedFlipbook('ready') }))

  const response = await pagesRequest(userId, newUserId())
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.doesNotMatch(text, /craftflip\/users|publicId|cloudinary|version/i)
  const { data } = JSON.parse(text)
  assert.deepEqual(data.pages, [
    { pageNumber: 1, width: 1600, height: 2263 },
    { pageNumber: 2, width: 1600, height: 2263 },
  ])
  assert.equal(data.flipbook.status, 'ready')
  const [filter] = flipbookModel.findOne.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
})

test('the page list is empty while a flipbook is not converted yet', async () => {
  for (const status of ['uploaded', 'processing', 'failed']) {
    flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => storedFlipbook(status, []) }))
    const response = await pagesRequest(newUserId(), newUserId())
    const { data } = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.flipbook.status, status)
    assert.deepEqual(data.pages, [])
  }
})

test("another user's or a missing flipbook's page list returns 404", async () => {
  const response = await pagesRequest(newUserId(), newUserId())
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })
  assert.equal((await pagesRequest(newUserId(), 'not-an-id')).status, 404)
})

test("a page image is sent only to the flipbook's owner, as image bytes", async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  const [, firstPage] = STORED_PAGES
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ pages: [firstPage] }) }))

  const response = await pageImageRequest(userId, flipbookId, 1)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.match(response.headers.get('cache-control'), /^private/)
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'RIFF-page-image')

  const [filter] = flipbookModel.findOne.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.equal(filter._id, flipbookId)
  assert.equal(filter.status, 'ready')
  assert.equal(storage.fetchPageImage.mock.calls[0].arguments[0], firstPage)
  assert.equal(storage.fetchPageImage.mock.calls[0].arguments[1], 'full')
})

test('the owner gets a small page preview with ?size=thumb; any other size is a 404 without a lookup', async () => {
  const userId = newUserId()
  const [, firstPage] = STORED_PAGES
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ pages: [firstPage] }) }))
  const url = (size) => `${server.url}/api/flipbooks/${newUserId()}/pages/1/image?size=${size}`
  const response = await fetch(url('thumb'), { headers: { 'x-test-user': userId } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(storage.fetchPageImage.mock.calls[0].arguments[1], 'thumb')
  assert.equal(String(flipbookModel.findOne.mock.calls[0].arguments[0].ownerId), userId)

  for (const size of ['large', 'w_4000', '', 'thumb,full']) {
    assert.equal((await fetch(url(size), { headers: { 'x-test-user': userId } })).status, 404, size)
  }
  assert.equal(flipbookModel.findOne.mock.callCount(), 1)
  assert.equal(storage.fetchPageImage.mock.callCount(), 1)
})

test("another user's flipbook, an unconverted flipbook or a missing page returns 404 for page images", async () => {
  const response = await pageImageRequest(newUserId(), newUserId(), 1)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Page not found.' })

  for (const pageNumber of ['0', '-1', '1.5', 'abc']) {
    assert.equal((await pageImageRequest(newUserId(), newUserId(), pageNumber)).status, 404)
  }
  assert.equal((await pageImageRequest(newUserId(), 'not-an-id', 1)).status, 404)
  assert.equal(storage.fetchPageImage.mock.callCount(), 0)
})

test('a Cloudinary delivery failure returns a structured 502 without details', async () => {
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ pages: [STORED_PAGES[1]] }) }))
  storage.fetchPageImage.mock.mockImplementationOnce(async () => {
    throw new Error('Cloudinary page delivery failed (http 401)')
  })
  const response = await pageImageRequest(newUserId(), newUserId(), 1)
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { success: false, message: "We couldn't load this page. Please try again." })
})

test('page images return 503 when Cloudinary is not configured', async () => {
  state.cloudinaryConfigured = false
  const response = await pageImageRequest(newUserId(), newUserId(), 1)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).success, false)
})

function deleteRequest(userId, flipbookId) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}`, { method: 'DELETE', headers: { 'x-test-user': userId } })
}

function claimedForDeletion(userId, flipbookId) {
  return {
    _id: new mongoose.Types.ObjectId(flipbookId),
    ownerId: new mongoose.Types.ObjectId(userId),
    status: 'deleting',
    pdfAsset: { publicId: `craftflip/users/${userId}/flipbooks/${flipbookId}/original.pdf` },
  }
}

test("the owner deletes their flipbook: files first, then the record", async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  const claimed = claimedForDeletion(userId, flipbookId)
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => claimed)

  const response = await deleteRequest(userId, flipbookId)
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.doesNotMatch(text, /craftflip\/users|publicId|cloudinary/i)
  assert.deepEqual(JSON.parse(text), { success: true, data: { id: flipbookId } })

  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter._id, flipbookId)
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $in: ['uploaded', 'ready', 'failed', 'deleting'] })
  assert.deepEqual(update, { $set: { status: 'deleting', isPublished: false } })

  assert.equal(storage.deleteFlipbookAssets.mock.calls[0].arguments[0], claimed)
  const [deleteFilter] = flipbookModel.deleteOne.mock.calls[0].arguments
  assert.equal(deleteFilter.ownerId.toString(), userId)
  assert.equal(deleteFilter.status, 'deleting')
  // Its analytics are removed after the record, for this flipbook of this owner only.
  const [analyticsFilter] = viewSessionModel.deleteMany.mock.calls.at(-1).arguments
  assert.equal(String(analyticsFilter.flipbookId), String(claimed._id))
  assert.equal(analyticsFilter.ownerId.toString(), userId)
})

test('a failed analytics cleanup never fails the deletion', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => claimedForDeletion(userId, flipbookId))
  viewSessionModel.deleteMany.mock.mockImplementationOnce(async () => {
    throw new Error('database unavailable')
  })
  const response = await deleteRequest(userId, flipbookId)
  assert.equal(response.status, 200)
})

test("deleting another user's or a missing flipbook returns the same 404 and deletes nothing", async () => {
  const response = await deleteRequest(newUserId(), newUserId())
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })
  const [ownerCheck] = flipbookModel.findOne.mock.calls[0].arguments
  assert.ok(ownerCheck.ownerId)

  assert.equal((await deleteRequest(newUserId(), 'not-an-id')).status, 404)
  assert.equal(storage.deleteFlipbookAssets.mock.callCount(), 0)
  assert.equal(flipbookModel.deleteOne.mock.callCount(), 0)
})

test('a flipbook being converted cannot be deleted, so no page images are left behind', async () => {
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ status: 'processing' }) }))
  const response = await deleteRequest(newUserId(), newUserId())
  assert.equal(response.status, 409)
  assert.equal((await response.json()).success, false)
  assert.equal(storage.deleteFlipbookAssets.mock.callCount(), 0)
  assert.equal(flipbookModel.deleteOne.mock.callCount(), 0)
})

test('a Cloudinary cleanup failure keeps the record and does not report success', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => claimedForDeletion(userId, flipbookId))
  storage.deleteFlipbookAssets.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('Server error at api.cloudinary.com'), { http_code: 500 })
  })

  const response = await deleteRequest(userId, flipbookId)
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.doesNotMatch(body.message, /cloudinary/i)
  assert.equal(flipbookModel.deleteOne.mock.callCount(), 0)
})

test('a deletion whose cleanup failed can be retried, and repeating a finished deletion is a 404', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()

  // The retry claims the record that the failed attempt left as "deleting".
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => claimedForDeletion(userId, flipbookId))
  assert.equal((await deleteRequest(userId, flipbookId)).status, 200)
  assert.deepEqual(flipbookModel.findOneAndUpdate.mock.calls[0].arguments[0].status.$in.includes('deleting'), true)

  // Once the record is gone, deleting again touches nothing.
  const again = await deleteRequest(userId, flipbookId)
  assert.equal(again.status, 404)
  assert.equal(storage.deleteFlipbookAssets.mock.callCount(), 1)
})

test('deletion returns 503 without claiming the flipbook when Cloudinary is not configured', async () => {
  state.cloudinaryConfigured = false
  const response = await deleteRequest(newUserId(), newUserId())
  assert.equal(response.status, 503)
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

test('a flipbook being deleted cannot be converted', async () => {
  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ status: 'deleting' }) }))
  const response = await convertRequest(newUserId(), newUserId())
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { success: false, message: 'This flipbook is being deleted.' })
  assert.equal(conversion.queueConversion.mock.callCount(), 0)
})

function publicationRequest(userId, flipbookId, action) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/${action}`, { method: 'POST', headers: { 'x-test-user': userId } })
}

test('the list reports how many flipbooks are published and the plan limit', async () => {
  const response = await fetch(`${server.url}/api/flipbooks`, { headers: { 'x-test-user': newUserId() } })
  assert.deepEqual((await response.json()).data.publishing, { published: 2, limit: 3 })

  state.plan = 'pro'
  const pro = await fetch(`${server.url}/api/flipbooks`, { headers: { 'x-test-user': newUserId() } })
  assert.deepEqual((await pro.json()).data.publishing, { published: 2, limit: null })
})

test('publish and unpublish act for the signed-in user and return the summary', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()

  const published = await publicationRequest(userId, flipbookId, 'publish')
  assert.equal(published.status, 200)
  assert.deepEqual(await published.json(), { success: true, data: { flipbook: { id: 'f', isPublished: true } } })
  const [user, id] = publishing.publishFlipbook.mock.calls[0].arguments
  assert.equal(user._id.toString(), userId)
  assert.equal(id, flipbookId)

  const unpublished = await publicationRequest(userId, flipbookId, 'unpublish')
  assert.equal(unpublished.status, 200)
  assert.equal((await unpublished.json()).data.flipbook.isPublished, false)
  assert.equal(publishing.unpublishFlipbook.mock.calls[0].arguments[0]._id.toString(), userId)
})

test('publishing errors keep their status and safe message; invalid IDs are 404 without a lookup', async () => {
  for (const [status, message] of [
    [404, 'Flipbook not found.'],
    [409, 'Only converted flipbooks can be published.'],
    [403, 'Your Free plan allows 3 published flipbooks at a time. Unpublish or delete one to publish this flipbook.'],
  ]) {
    publishing.publishFlipbook.mock.mockImplementationOnce(async () => {
      throw new FakePublishError(status, message)
    })
    const response = await publicationRequest(newUserId(), newUserId(), 'publish')
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { success: false, message })
  }

  assert.equal((await publicationRequest(newUserId(), 'not-an-id', 'publish')).status, 404)
  assert.equal((await publicationRequest(newUserId(), 'not-an-id', 'unpublish')).status, 404)
  assert.equal(publishing.publishFlipbook.mock.callCount(), 3)
  assert.equal(publishing.unpublishFlipbook.mock.callCount(), 0)
})

test('an unexpected publishing failure is a generic 500', async () => {
  publishing.publishFlipbook.mock.mockImplementationOnce(async () => {
    throw new Error('MongoServerError: connection reset at 10.0.0.1')
  })
  const response = await publicationRequest(newUserId(), newUserId(), 'publish')
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { success: false, message: 'Something went wrong. Please try again.' })
})

test('a new upload never receives a slug that was published before', async () => {
  const proposed = []
  // The first slug the generator proposes is treated as retired; the upload must use another.
  state.isRetired = (slug) => {
    proposed.push(slug)
    return proposed.length === 1
  }
  try {
    const response = await uploadRequest(newUserId(), PDF_BYTES, 'Brochure.pdf')
    assert.equal(response.status, 201)
    const [fields] = flipbookModel.create.mock.calls[0].arguments
    assert.equal(proposed.length, 2)
    assert.equal(fields.slug, proposed[1])
    assert.notEqual(fields.slug, proposed[0])
  } finally {
    state.isRetired = () => false
  }
})

test('an upload starts conversion straight away with the uploaded bytes', async () => {
  const userId = newUserId()
  state.plan = 'pro'
  const response = await uploadRequest(userId, PDF_BYTES, 'Listing.pdf')
  assert.equal(response.status, 201)

  const [fields] = flipbookModel.create.mock.calls[0].arguments
  assert.equal(fields.status, 'processing')
  assert.ok(fields.conversion.attemptId)
  assert.equal(fields.conversion.stage, 'queued')
  assert.equal(fields.conversion.completedPages, 0)

  const [queued, options] = conversion.queueConversion.mock.calls[0].arguments
  assert.equal(String(queued._id), String(fields._id))
  assert.equal(options.maxPages, 200)
  assert.ok(Buffer.from(options.pdf).equals(PDF_BYTES))
})

test('with a full conversion queue the upload is stored but left for Convert later', async () => {
  state.queueFull = true
  const response = await uploadRequest(newUserId(), PDF_BYTES)
  assert.equal(response.status, 201)
  const [fields] = flipbookModel.create.mock.calls[0].arguments
  assert.equal(fields.status, undefined)
  assert.equal(fields.conversion, undefined)
  assert.equal(conversion.queueConversion.mock.callCount(), 0)
})

function styleRequest(userId, flipbookId, body) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}`, {
    method: 'PATCH',
    headers: { 'x-test-user': userId, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('the owner changes the viewing style; only that field is written, for their own flipbook', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ toSummary: () => ({ id: flipbookId, viewerStyle: 'editorial', isPublished: true }) }))

  const response = await styleRequest(userId, flipbookId, { viewerStyle: 'editorial' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: { flipbook: { id: flipbookId, viewerStyle: 'editorial', isPublished: true } } })

  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter._id, flipbookId)
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $ne: 'deleting' })
  // Publication, slug and pages are untouched, so a published link keeps working.
  assert.deepEqual(update, { $set: { viewerStyle: 'editorial' } })
})

test('all four styles are accepted', async () => {
  for (const viewerStyle of ['luxury-flip', 'clean-swipe', 'classic-book', 'editorial']) {
    flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ toSummary: () => ({ viewerStyle }) }))
    const response = await styleRequest(newUserId(), newUserId(), { viewerStyle })
    assert.equal(response.status, 200, viewerStyle)
  }
})

test('invalid styles and other fields are refused without touching the database', async () => {
  const bodies = [
    { viewerStyle: 'neon' },
    { viewerStyle: 'LUXURY-FLIP' },
    { viewerStyle: '' },
    { viewerStyle: 3 },
    { viewerStyle: null },
    { viewerStyle: ['editorial'] },
    { viewerStyle: 'editorial', ownerId: 'someone-else' },
    { isPublished: true },
    {},
    ['editorial'],
  ]
  for (const body of bodies) {
    const response = await styleRequest(newUserId(), newUserId(), body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.equal((await response.json()).success, false)
  }
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

test("another user's or a missing flipbook is 404; a flipbook being deleted is 409", async () => {
  const response = await styleRequest(newUserId(), newUserId(), { viewerStyle: 'editorial' })
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })

  flipbookModel.findOne.mock.mockImplementationOnce(() => ({ select: async () => ({ status: 'deleting' }) }))
  assert.equal((await styleRequest(newUserId(), newUserId(), { viewerStyle: 'editorial' })).status, 409)

  assert.equal((await styleRequest(newUserId(), 'not-an-id', { viewerStyle: 'editorial' })).status, 404)
})

function detailsRequest(userId, flipbookId, body) {
  return fetch(`${server.url}/api/flipbooks/${flipbookId}`, {
    method: 'PATCH',
    headers: { 'x-test-user': userId, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('the owner renames a flipbook: the title is trimmed and tidied, and only the title is written', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async (filter, update) => ({ toSummary: () => ({ id: flipbookId, title: update.$set.title }) }))

  const response = await detailsRequest(userId, flipbookId, { title: '  Spring \n Catalog\t 2026  ' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.flipbook.title, 'Spring Catalog 2026')

  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $ne: 'deleting' })
  assert.deepEqual(update, { $set: { title: 'Spring Catalog 2026' } })
  assert.equal(publishing.changeSlug.mock.callCount(), 0)
})

test('invalid titles are refused before anything is written', async () => {
  for (const title of ['', '   ', '\n\t', 'x'.repeat(121), 42, null, ['Title']]) {
    const response = await detailsRequest(newUserId(), newUserId(), { title })
    assert.equal(response.status, 400, JSON.stringify(title))
    assert.match((await response.json()).message, /Titles must be 1 to 120 characters/)
  }
  assert.equal((await detailsRequest(newUserId(), newUserId(), { title: 'x'.repeat(120) })).status, 404)
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 1)
})

test('protected fields can never be changed, even next to an allowed one', async () => {
  const protectedFields = ['ownerId', 'status', 'isPublished', 'publishedAt', 'firstPublishedAt', 'pages', 'pageCount', 'pdfAsset', 'conversion', 'originalFile', '_id', 'plan', 'createdAt']
  for (const field of protectedFields) {
    const response = await detailsRequest(newUserId(), newUserId(), { title: 'Fine', [field]: 'x' })
    assert.equal(response.status, 400, field)
    assert.equal((await response.json()).message, 'Only the title, link, viewing style and reader settings can be changed.')
  }
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
  assert.equal(publishing.changeSlug.mock.callCount(), 0)
  assert.equal((await detailsRequest(newUserId(), newUserId(), '{"title":')).status, 400)
  assert.equal((await detailsRequest(newUserId(), newUserId(), { confirmSlugChange: true })).status, 400)
})

test('a new link is normalised and validated, then changed under the publishing rules', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  const response = await detailsRequest(userId, flipbookId, { slug: '  Spring-Catalog-2026 ', confirmSlugChange: true })
  assert.equal(response.status, 200)
  const [user, id, slug, options] = publishing.changeSlug.mock.calls[0].arguments
  assert.equal(user._id.toString(), userId)
  assert.equal(id, flipbookId)
  assert.equal(slug, 'spring-catalog-2026')
  assert.deepEqual(options, { confirmed: true })

  for (const bad of ['ab', 'has space', 'double--hyphen', '-leading', 'trailing-', 'emoji-😀', 'x'.repeat(81), 'dots.in.it', 7]) {
    assert.equal((await detailsRequest(userId, flipbookId, { slug: bad })).status, 400, String(bad))
  }
  assert.equal((await detailsRequest(userId, flipbookId, { slug: 'fine-slug', confirmSlugChange: 'yes' })).status, 400)
  assert.equal(publishing.changeSlug.mock.callCount(), 1)
})

test('a refused link change keeps its status and safe details, and nothing else is written', async () => {
  publishing.changeSlug.mock.mockImplementationOnce(async () => {
    throw new FakePublishError(409, 'This flipbook has been published before.', { requiresConfirmation: true })
  })
  const response = await detailsRequest(newUserId(), newUserId(), { slug: 'new-link', title: 'New title' })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { success: false, message: 'This flipbook has been published before.', requiresConfirmation: true })
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0, 'the title was not saved either')

  publishing.changeSlug.mock.mockImplementationOnce(async () => {
    throw new FakePublishError(404, 'Flipbook not found.')
  })
  assert.equal((await detailsRequest(newUserId(), newUserId(), { slug: 'new-link' })).status, 404)
})

test('title, link and style can be saved together', async () => {
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async (filter, update) => ({ toSummary: () => ({ id: flipbookId, ...update.$set, slug: 'new-link' }) }))
  const response = await detailsRequest(newUserId(), flipbookId, { title: 'Renamed', slug: 'new-link', viewerStyle: 'editorial' })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.flipbook, { id: flipbookId, title: 'Renamed', viewerStyle: 'editorial', slug: 'new-link' })
  assert.deepEqual(flipbookModel.findOneAndUpdate.mock.calls[0].arguments[1], { $set: { title: 'Renamed', viewerStyle: 'editorial' } })
})

test('reader settings are saved as individual fields, for the owner, next to other details', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ toSummary: () => ({ id: flipbookId }) }))
  const response = await detailsRequest(userId, flipbookId, {
    title: 'Riverside Homes',
    reader: { primaryColor: '#1F4E79', cta: { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' }, allowDownload: true },
  })
  assert.equal(response.status, 200)
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(update, {
    $set: {
      title: 'Riverside Homes',
      'reader.primaryColor': '#1f4e79',
      'reader.allowDownload': true,
      'reader.cta': { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' },
    },
  })
})

test('invalid reader settings are refused with 400 and nothing is written', async () => {
  for (const reader of [
    { primaryColor: 'blue' },
    { cta: { enabled: true, label: 'Go', url: 'javascript:alert(1)' } },
    { logo: null },
    { allowDownload: 1 },
    { ownerId: 'x' },
    // The Milestone 9 top-bar colour was replaced by the background.
    { accentColor: '#000000' },
    { background: { kind: 'color', color: 'red', preset: null } },
    { background: { kind: 'preset', color: null, preset: 'someone-elses-image' } },
    { background: { kind: 'image', color: null, preset: null, image: { publicId: 'x' } } },
  ]) {
    const response = await detailsRequest(newUserId(), newUserId(), { reader })
    assert.equal(response.status, 400, JSON.stringify(reader))
    assert.equal((await response.json()).success, false)
  }
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

async function logoFile(format = 'png') {
  return sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 31, g: 78, b: 121, alpha: 1 } } })[format]().toBuffer()
}

function logoRequest(userId, flipbookId, buffer, filename = 'logo.png', type = 'image/png') {
  const form = new FormData()
  if (buffer) form.append('logo', new Blob([buffer], { type }), filename)
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/logo`, { method: 'POST', headers: { 'x-test-user': userId }, body: form })
}

// findOne is called to check ownership first and to build the summary last.
function ownedFlipbook(summary = { id: 'f', reader: { logo: { width: 640, height: 213 } } }) {
  flipbookModel.findOne.mock.mockImplementation((filter) => ({ select: async () => ({ _id: filter._id, toSummary: () => summary }) }))
}

test('a PNG logo is re-encoded, stored in the flipbook branding folder, and replaces the previous one', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  ownedFlipbook()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ reader: { logo: { publicId: 'old-logo' } } }))
  try {
    const response = await logoRequest(userId, flipbookId, await logoFile('png'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.flipbook.reader.logo.width, 640)
  } finally {
    flipbookModel.findOne.mock.restore()
  }

  const [uploaded, publicId] = storage.uploadLogoImage.mock.calls[0].arguments
  assert.equal(uploaded.subarray(8, 12).toString(), 'WEBP')
  const metadata = await sharp(uploaded).metadata()
  assert.ok(metadata.width <= 640 && metadata.height <= 240)
  assert.match(publicId, new RegExp(`^craftflip/users/${userId}/flipbooks/${flipbookId}/branding/logo-`))
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $ne: 'deleting' })
  assert.equal(update.$set['reader.logo'].format, 'webp')
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], 'old-logo')
})

test('only PNG, JPEG and WebP logos up to 2 MB are accepted, checked by their bytes', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const cases = [
    [svg, 'logo.svg', 'image/svg+xml', 400],
    [Buffer.from('%PDF-1.4 not an image'), 'logo.png', 'image/png', 400],
    [Buffer.from('GIF89a...'), 'logo.gif', 'image/gif', 400],
    [Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]), 'broken.png', 'image/png', 400],
    [Buffer.alloc(2 * 1024 * 1024 + 10), 'huge.png', 'image/png', 413],
    [null, null, null, 400],
  ]
  for (const [buffer, filename, type, status] of cases) {
    const response = await logoRequest(newUserId(), newUserId(), buffer, filename ?? 'x', type ?? 'image/png')
    assert.equal(response.status, status, filename ?? 'no file')
    assert.equal((await response.json()).success, false)
  }
  assert.equal(storage.uploadLogoImage.mock.callCount(), 0)
  for (const format of ['jpeg', 'webp']) {
    // Valid formats reach the ownership check (404 here: no flipbook in the mock).
    assert.equal((await logoRequest(newUserId(), newUserId(), await logoFile(format), `logo.${format}`, `image/${format}`)).status, 404)
  }
})

test("another user's or a missing flipbook gets 404 and nothing is uploaded", async () => {
  const response = await logoRequest(newUserId(), newUserId(), await logoFile())
  assert.equal(response.status, 404)
  assert.equal(storage.uploadLogoImage.mock.callCount(), 0)
})

test('if deletion starts during a logo upload, the new logo file is removed again', async () => {
  let ownershipChecks = 0
  flipbookModel.findOne.mock.mockImplementation(() => ({
    select: async () => (++ownershipChecks === 1 ? { _id: 'f' } : { status: 'deleting' }),
  }))
  try {
    const response = await logoRequest(newUserId(), newUserId(), await logoFile())
    assert.equal(response.status, 409)
  } finally {
    flipbookModel.findOne.mock.restore()
  }
  const [, uploadedId] = storage.uploadLogoImage.mock.calls[0].arguments
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], uploadedId)
})

test('removing the logo clears it and deletes its file; owner only', async () => {
  const userId = newUserId()
  ownedFlipbook({ id: 'f', reader: { logo: null } })
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ reader: { logo: { publicId: 'current-logo' } } }))
  try {
    const response = await fetch(`${server.url}/api/flipbooks/${newUserId()}/logo`, { method: 'DELETE', headers: { 'x-test-user': userId } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.flipbook.reader.logo, null)
  } finally {
    flipbookModel.findOne.mock.restore()
  }
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(update, { $set: { 'reader.logo': null } })
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], 'current-logo')

  const missing = await fetch(`${server.url}/api/flipbooks/${newUserId()}/logo`, { method: 'DELETE', headers: { 'x-test-user': newUserId() } })
  assert.equal(missing.status, 404)
})

test('the background kind, colour and preset are saved as individual fields, keeping the uploaded image', async () => {
  const userId = newUserId()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ toSummary: () => ({ id: 'f' }) }))
  const response = await detailsRequest(userId, newUserId(), { reader: { background: { kind: 'preset', color: '#F4EFE6', preset: 'misty-forest' } } })
  assert.equal(response.status, 200)
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $ne: 'deleting' })
  assert.deepEqual(update, {
    $set: { 'reader.background.kind': 'preset', 'reader.background.color': '#f4efe6', 'reader.background.preset': 'misty-forest' },
  })
})

async function photoFile(format = 'jpeg', { width = 3000, height = 2000, color = { r: 20, g: 30, b: 40 } } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } })[format]().toBuffer()
}

function backgroundRequest(userId, flipbookId, buffer, filename = 'background.jpg', type = 'image/jpeg') {
  const form = new FormData()
  if (buffer) form.append('background', new Blob([buffer], { type }), filename)
  return fetch(`${server.url}/api/flipbooks/${flipbookId}/background`, { method: 'POST', headers: { 'x-test-user': userId }, body: form })
}

test('a background image is re-encoded, stored in the branding folder, chosen, and replaces the previous one', async () => {
  const userId = newUserId()
  const flipbookId = newUserId()
  ownedFlipbook({ id: 'f', reader: { background: { kind: 'image' } } })
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ reader: { background: { image: { publicId: 'old-background' } } } }))
  try {
    const response = await backgroundRequest(userId, flipbookId, await photoFile('jpeg'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.flipbook.reader.background.kind, 'image')
  } finally {
    flipbookModel.findOne.mock.restore()
  }

  const [uploaded, publicId] = storage.uploadLogoImage.mock.calls[0].arguments
  assert.equal(uploaded.subarray(8, 12).toString(), 'WEBP')
  const metadata = await sharp(uploaded).metadata()
  assert.ok(metadata.width <= 2560 && metadata.height <= 2560)
  assert.match(publicId, new RegExp(`^craftflip/users/${userId}/flipbooks/${flipbookId}/branding/background-`))
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(filter.status, { $ne: 'deleting' })
  assert.equal(update.$set['reader.background.kind'], 'image')
  const stored = update.$set['reader.background.image']
  assert.equal(stored.format, 'webp')
  assert.equal(stored.tone, 'dark')
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], 'old-background')
})

test('a light background image is recorded as light', async () => {
  ownedFlipbook()
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ reader: {} }))
  try {
    const response = await backgroundRequest(newUserId(), newUserId(), await photoFile('png', { width: 800, height: 600, color: { r: 240, g: 236, b: 228 } }), 'bg.png', 'image/png')
    assert.equal(response.status, 200)
  } finally {
    flipbookModel.findOne.mock.restore()
  }
  assert.equal(flipbookModel.findOneAndUpdate.mock.calls[0].arguments[1].$set['reader.background.image'].tone, 'light')
  assert.equal(storage.deleteLogoImage.mock.callCount(), 0)
})

test('only PNG, JPEG and WebP backgrounds up to 8 MB are accepted, checked by their bytes', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const cases = [
    [svg, 'bg.svg', 'image/svg+xml', 400],
    [Buffer.from('%PDF-1.4 not an image'), 'bg.jpg', 'image/jpeg', 400],
    [Buffer.from('GIF89a...'), 'bg.gif', 'image/gif', 400],
    [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]), 'broken.jpg', 'image/jpeg', 400],
    [Buffer.alloc(8 * 1024 * 1024 + 10), 'huge.jpg', 'image/jpeg', 413],
    [null, null, null, 400],
  ]
  for (const [buffer, filename, type, status] of cases) {
    const response = await backgroundRequest(newUserId(), newUserId(), buffer, filename ?? 'x', type ?? 'image/jpeg')
    assert.equal(response.status, status, filename ?? 'no file')
    assert.equal((await response.json()).success, false)
  }
  // A photo larger than the 2 MB logo limit is fine as a background (404: no flipbook in the mock).
  const large = await photoFile('png', { width: 1400, height: 1400 })
  const bigEnough = Buffer.concat([large, Buffer.alloc(Math.max(0, 3 * 1024 * 1024 - large.length))])
  assert.equal((await backgroundRequest(newUserId(), newUserId(), bigEnough, 'bg.png', 'image/png')).status, 404)
  assert.equal(storage.uploadLogoImage.mock.callCount(), 0)
})

test("another user's background upload gets 404; a deletion during the upload removes the new file", async () => {
  assert.equal((await backgroundRequest(newUserId(), newUserId(), await photoFile())).status, 404)
  assert.equal(storage.uploadLogoImage.mock.callCount(), 0)

  let ownershipChecks = 0
  flipbookModel.findOne.mock.mockImplementation(() => ({
    select: async () => (++ownershipChecks === 1 ? { _id: 'f' } : { status: 'deleting' }),
  }))
  try {
    assert.equal((await backgroundRequest(newUserId(), newUserId(), await photoFile())).status, 409)
  } finally {
    flipbookModel.findOne.mock.restore()
  }
  const [, uploadedId] = storage.uploadLogoImage.mock.calls[0].arguments
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], uploadedId)
})

test('removing the background image clears it and deletes its file; owner only', async () => {
  const userId = newUserId()
  ownedFlipbook({ id: 'f', reader: { background: { kind: 'default', image: null } } })
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => ({ reader: { background: { image: { publicId: 'current-background' } } } }))
  try {
    const response = await fetch(`${server.url}/api/flipbooks/${newUserId()}/background`, { method: 'DELETE', headers: { 'x-test-user': userId } })
    assert.equal(response.status, 200)
  } finally {
    flipbookModel.findOne.mock.restore()
  }
  const [filter, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.ownerId.toString(), userId)
  assert.deepEqual(update, { $set: { 'reader.background.image': null } })
  assert.equal(storage.deleteLogoImage.mock.calls[0].arguments[0], 'current-background')

  const missing = await fetch(`${server.url}/api/flipbooks/${newUserId()}/background`, { method: 'DELETE', headers: { 'x-test-user': newUserId() } })
  assert.equal(missing.status, 404)
})

test("the owner's background image is streamed only to the owner", async () => {
  const userId = newUserId()
  flipbookModel.findOne.mock.mockImplementationOnce((filter) => ({
    select: async () => (String(filter.ownerId) === userId ? { reader: { background: { image: { publicId: 'bg-id', version: 1, format: 'webp' } } } } : null),
  }))
  const response = await fetch(`${server.url}/api/flipbooks/${newUserId()}/background`, { headers: { 'x-test-user': userId } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(storage.openPageImageStream.mock.calls.at(-1).arguments[0].publicId, 'bg-id')
  const other = await fetch(`${server.url}/api/flipbooks/${newUserId()}/background`, { headers: { 'x-test-user': newUserId() } })
  assert.equal(other.status, 404)
})

test("the owner downloads their own original whatever the reader setting; others get 404", async () => {
  const userId = newUserId()
  flipbookModel.findOne.mock.mockImplementationOnce((filter) => ({
    select: async () => (String(filter.ownerId) === userId ? { pdfAsset: { publicId: 'original-id' }, originalFile: { filename: 'Riverside Homes.pdf' } } : null),
  }))
  const response = await fetch(`${server.url}/api/flipbooks/${newUserId()}/original`, { headers: { 'x-test-user': userId } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.match(response.headers.get('content-disposition'), /attachment; filename="Riverside Homes.pdf"/)
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '%PDF-1.4 original')
  assert.equal(storage.openOriginalPdfStream.mock.calls[0].arguments[0], 'original-id')

  const other = await fetch(`${server.url}/api/flipbooks/${newUserId()}/original`, { headers: { 'x-test-user': newUserId() } })
  assert.equal(other.status, 404)
  assert.equal(storage.openOriginalPdfStream.mock.callCount(), 1)
})
