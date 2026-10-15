import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { cloudinaryConfigured: true }

const storage = {
  uploadPdf: mock.fn(async (buffer, publicId) => ({ public_id: publicId, version: 1, resource_type: 'raw', type: 'authenticated' })),
  deletePdf: mock.fn(async () => {}),
}

const flipbookModel = {
  create: mock.fn(async (fields) => ({ ...fields, toSummary: () => ({ id: fields._id, title: fields.title }) })),
  find: mock.fn(() => ({ sort: () => ({ limit: async () => [] }) })),
  findOne: mock.fn(async () => null),
}

// Tests pick the signed-in user with this header; the real requireAuth is covered in requireAuth.test.js.
mock.module(moduleUrl('../middleware/requireAuth.js'), {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(req.headers['x-test-user']) }
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
    pdfPublicId: (userId, flipbookId) => `craftflip/users/${userId}/flipbooks/${flipbookId}/original.pdf`,
  },
})
mock.module(moduleUrl('../models/Flipbook.js'), {
  defaultExport: flipbookModel,
  namedExports: { MAX_TITLE_LENGTH: 120, FLIPBOOK_STATUSES: ['uploaded', 'processing', 'ready', 'failed'] },
})

const { default: flipbookRoutes } = await import('../routes/flipbookRoutes.js')
const { notFound, errorHandler } = await import('../middleware/errorHandler.js')

const app = express()
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
  storage.uploadPdf.mock.resetCalls()
  storage.deletePdf.mock.resetCalls()
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
