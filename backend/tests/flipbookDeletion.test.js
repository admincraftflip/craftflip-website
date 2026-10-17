import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

const moduleUrl = (path) => new URL(path, import.meta.url).href

// A fake Cloudinary account: a set of stored public IDs, split by resource type.
const stored = { raw: new Set(), image: new Set() }
const cloudinary = {
  uploader: {
    destroy: mock.fn(async (publicId, options) => {
      const existed = stored[options.resource_type].delete(publicId)
      return { result: existed ? 'ok' : 'not found' }
    }),
  },
  api: {
    delete_resources_by_prefix: mock.fn(async (prefix, options) => {
      const deleted = {}
      for (const publicId of [...stored[options.resource_type]]) {
        if (publicId.startsWith(prefix)) {
          stored[options.resource_type].delete(publicId)
          deleted[publicId] = 'deleted'
        }
      }
      return { deleted, partial: false }
    }),
  },
}

mock.module(moduleUrl('../config/cloudinary.js'), { namedExports: { getCloudinary: () => cloudinary } })

const { deleteFlipbookAssets, pdfPublicId } = await import('../utils/pdfStorage.js')

function newFlipbook() {
  const ownerId = new mongoose.Types.ObjectId()
  const _id = new mongoose.Types.ObjectId()
  return { _id, ownerId, pdfAsset: { publicId: pdfPublicId(ownerId, _id) } }
}

function storeFlipbookFiles(flipbook, attempts = ['attempt-a', 'attempt-b']) {
  const folder = `craftflip/users/${flipbook.ownerId}/flipbooks/${flipbook._id}`
  stored.raw.add(flipbook.pdfAsset.publicId)
  for (const attempt of attempts) {
    for (const page of ['page-001', 'page-002', 'page-003']) stored.image.add(`${folder}/pages/${attempt}/${page}`)
  }
}

beforeEach(() => {
  stored.raw.clear()
  stored.image.clear()
  cloudinary.uploader.destroy.mock.resetCalls()
  cloudinary.api.delete_resources_by_prefix.mock.resetCalls()
})

test("deleting a flipbook removes its original PDF and every attempt's page images, and nothing else", async () => {
  const flipbook = newFlipbook()
  const sameUserOtherFlipbook = { ...newFlipbook(), ownerId: flipbook.ownerId }
  sameUserOtherFlipbook.pdfAsset.publicId = pdfPublicId(flipbook.ownerId, sameUserOtherFlipbook._id)
  const otherUserFlipbook = newFlipbook()
  for (const each of [flipbook, sameUserOtherFlipbook, otherUserFlipbook]) storeFlipbookFiles(each)

  await deleteFlipbookAssets(flipbook)

  const remaining = [...stored.raw, ...stored.image]
  assert.equal(remaining.filter((publicId) => publicId.includes(String(flipbook._id))).length, 0)
  assert.equal(stored.raw.size, 2)
  assert.equal(stored.image.size, 12)

  const [prefix, options] = cloudinary.api.delete_resources_by_prefix.mock.calls[0].arguments
  assert.equal(prefix, `craftflip/users/${flipbook.ownerId}/flipbooks/${flipbook._id}/pages/`)
  assert.equal(options.type, 'authenticated')
  assert.equal(cloudinary.uploader.destroy.mock.calls[0].arguments[1].resource_type, 'raw')
})

test('repeating a deletion is safe when the files are already gone', async () => {
  const flipbook = newFlipbook()
  storeFlipbookFiles(flipbook)
  await deleteFlipbookAssets(flipbook)
  await deleteFlipbookAssets(flipbook)
  assert.equal(stored.raw.size + stored.image.size, 0)
})

test('a flipbook that was never converted only needs its original PDF removed', async () => {
  const flipbook = newFlipbook()
  storeFlipbookFiles(flipbook, [])
  await deleteFlipbookAssets(flipbook)
  assert.equal(stored.raw.size, 0)
})

test('a page image Cloudinary could not delete makes the deletion fail', async () => {
  const flipbook = newFlipbook()
  cloudinary.api.delete_resources_by_prefix.mock.mockImplementationOnce(async () => ({
    deleted: { a: 'deleted', b: 'error' },
    partial: false,
  }))
  await assert.rejects(deleteFlipbookAssets(flipbook), /could not delete 1 page image/)
})

test('large page sets are deleted in batches until Cloudinary reports no more', async () => {
  const flipbook = newFlipbook()
  cloudinary.api.delete_resources_by_prefix.mock.mockImplementationOnce(async () => ({ deleted: { a: 'deleted' }, partial: true }))
  await deleteFlipbookAssets(flipbook)
  const pageCalls = cloudinary.api.delete_resources_by_prefix.mock.calls.filter((call) => call.arguments[0].endsWith('/pages/'))
  assert.equal(pageCalls.length, 2)
})

test('a failed PDF deletion stops before reporting success', async () => {
  const flipbook = newFlipbook()
  cloudinary.uploader.destroy.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('Server error'), { http_code: 500 })
  })
  await assert.rejects(deleteFlipbookAssets(flipbook))
})

test('a stored PDF ID outside the flipbook folder is refused, so other files are never deleted', async () => {
  const flipbook = newFlipbook()
  flipbook.pdfAsset.publicId = `craftflip/users/${new mongoose.Types.ObjectId()}/flipbooks/${flipbook._id}/original.pdf`
  await assert.rejects(deleteFlipbookAssets(flipbook), /outside the flipbook folder/)
  assert.equal(cloudinary.uploader.destroy.mock.callCount(), 0)
  assert.equal(cloudinary.api.delete_resources_by_prefix.mock.callCount(), 0)
})

test('a page image stream is refused when Cloudinary reports an error or an oversized file', async () => {
  const { openPageImageStream } = await import('../utils/pdfStorage.js')
  const page = { publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-001', version: 1, format: 'webp' }
  const realFetch = globalThis.fetch
  const cancelled = mock.fn()
  try {
    cloudinary.url = () => 'https://res.cloudinary.example/signed'
    globalThis.fetch = async () => new Response(null, { status: 401 })
    await assert.rejects(openPageImageStream(page), /http 401/)

    globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': String(25 * 1024 * 1024) }), body: { cancel: cancelled } })
    await assert.rejects(openPageImageStream(page), /size limit/)
    assert.equal(cancelled.mock.callCount(), 1)

    globalThis.fetch = async () => new Response('RIFF-page', { status: 200, headers: { 'content-length': '9' } })
    const { stream, contentLength } = await openPageImageStream(page)
    assert.equal(contentLength, 9)
    assert.equal(await new Response(stream).text(), 'RIFF-page')
  } finally {
    globalThis.fetch = realFetch
    delete cloudinary.url
  }
})

test("deleting a flipbook also removes its reader logos and background images, and nothing of other flipbooks", async () => {
  const flipbook = newFlipbook()
  const other = newFlipbook()
  const brandingOf = (book, name) => `craftflip/users/${book.ownerId}/flipbooks/${book._id}/branding/${name}`
  const names = ['logo-1', 'background-1', 'background-2']
  for (const book of [flipbook, other]) for (const name of names) stored.image.add(brandingOf(book, name))
  await deleteFlipbookAssets(flipbook)
  for (const name of names) {
    assert.equal(stored.image.has(brandingOf(flipbook, name)), false, name)
    assert.equal(stored.image.has(brandingOf(other, name)), true, name)
  }
})
