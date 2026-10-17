import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

// The real router and the real requireAuth: only storage is replaced, to see that nothing is deleted.
const deleteFlipbookAssets = mock.fn(async () => {})
mock.module(moduleUrl('../utils/pdfStorage.js'), {
  namedExports: {
    deleteFlipbookAssets,
    deletePdf: async () => {},
    deletePageImages: async () => {},
    downloadPdf: async () => null,
    fetchPageImage: async () => null,
    pageFolder: () => '',
    pagePublicId: () => '',
    pdfPublicId: () => '',
    uploadPageImage: async () => null,
    uploadPdf: async () => null,
    brandingFolder: () => '',
    uploadLogoImage: async () => null,
    deleteLogoImage: async () => {},
    openOriginalPdfStream: async () => null,
    openPageImageStream: async () => null,
  },
})

const { default: flipbookRoutes } = await import('../routes/flipbookRoutes.js')

const app = express()
app.use('/api/flipbooks', flipbookRoutes)
const server = await startServer(app)
test.after(() => server.close())

test('deleting without a valid bearer token is rejected with 401 and deletes nothing', async () => {
  const url = `${server.url}/api/flipbooks/${new mongoose.Types.ObjectId()}`
  for (const headers of [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer' }]) {
    const response = await fetch(url, { method: 'DELETE', headers })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { success: false, message: 'Authentication required.' })
  }
  assert.equal(deleteFlipbookAssets.mock.callCount(), 0)
})

test('changing the viewing style without a valid bearer token is rejected with 401', async () => {
  const url = `${server.url}/api/flipbooks/${new mongoose.Types.ObjectId()}`
  for (const headers of [{}, { Authorization: 'Bearer' }]) {
    const response = await fetch(url, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"viewerStyle":"editorial"}' })
    assert.equal(response.status, 401)
  }
})

test('publishing and unpublishing without a valid bearer token are rejected with 401', async () => {
  const flipbookId = new mongoose.Types.ObjectId()
  for (const action of ['publish', 'unpublish']) {
    for (const headers of [{}, { Authorization: 'Bearer' }]) {
      const response = await fetch(`${server.url}/api/flipbooks/${flipbookId}/${action}`, { method: 'POST', headers })
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { success: false, message: 'Authentication required.' })
    }
  }
})

test('changing the title or link without a valid bearer token is rejected with 401', async () => {
  const url = `${server.url}/api/flipbooks/${new mongoose.Types.ObjectId()}`
  for (const body of ['{"title":"New"}', '{"slug":"new-link"}']) {
    const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
    assert.equal(response.status, 401)
  }
})

test('logo, background and original routes without a valid bearer token are rejected with 401', async () => {
  const id = new mongoose.Types.ObjectId()
  for (const [method, path] of [['POST', 'logo'], ['DELETE', 'logo'], ['GET', 'logo'], ['POST', 'background'], ['DELETE', 'background'], ['GET', 'background'], ['GET', 'original']]) {
    const response = await fetch(`${server.url}/api/flipbooks/${id}/${path}`, { method })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})
