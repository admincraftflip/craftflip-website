import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import mongoose from 'mongoose'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { cloudinaryConfigured: true, claimed: null, saveMatched: 1, pageImage: null }

const flipbookModel = {
  findOneAndUpdate: mock.fn(async () => state.claimed),
  updateOne: mock.fn(async () => ({ matchedCount: state.saveMatched })),
}

const storage = {
  fetchPageImage: mock.fn(async () => state.pageImage),
  uploadSocialImage: mock.fn(async (buffer, publicId) => ({ public_id: publicId, version: 5, format: 'jpg', bytes: buffer.length })),
  deleteSocialImage: mock.fn(async () => {}),
}

mock.module(moduleUrl('../config/cloudinary.js'), { namedExports: { getCloudinary: () => (state.cloudinaryConfigured ? {} : null) } })
mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: flipbookModel })
mock.module(moduleUrl('../utils/pdfStorage.js'), {
  namedExports: {
    fetchPageImage: (...args) => storage.fetchPageImage(...args),
    uploadSocialImage: (...args) => storage.uploadSocialImage(...args),
    deleteSocialImage: (...args) => storage.deleteSocialImage(...args),
    socialFolder: (userId, flipbookId) => `craftflip/users/${userId}/flipbooks/${flipbookId}/social`,
  },
})

const { MAX_SOCIAL_IMAGE_ATTEMPTS, SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, ensureSocialImage, needsSocialImage, renderSocialImage } = await import(
  '../utils/socialImage.js'
)

// A converted page as the pipeline stores it: WebP, 1600px wide, A4 proportions, one colour.
function solidPage({ width = 1600, height = 2263, color = { r: 200, g: 30, b: 40 } } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } }).webp({ quality: 82 }).toBuffer()
}

// Busy, colourful content compresses badly, so it shows the size limits at work.
function busyPage() {
  const width = 1600
  const height = 2263
  const pixels = Buffer.alloc(width * height * 3)
  for (let index = 0; index < pixels.length; index++) pixels[index] = (index * 7919 + (index >> 7) * 104729) % 256
  return sharp(pixels, { raw: { width, height, channels: 3 } }).webp({ quality: 90 }).toBuffer()
}

async function pixelAt(jpeg, x, y) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

function claimedFlipbook() {
  return {
    _id: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    pages: [{ pageNumber: 1, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-001', version: 7, format: 'webp' }],
  }
}

beforeEach(async () => {
  state.cloudinaryConfigured = true
  state.claimed = claimedFlipbook()
  state.saveMatched = 1
  state.pageImage = await solidPage()
  for (const fn of [...Object.values(flipbookModel), ...Object.values(storage)]) {
    fn.mock.resetCalls()
    fn.mock.restore()
  }
})

// ---------- The image ----------

test('a portrait first page becomes a 1200x630 JPEG with the whole page centred over a darker backdrop', async () => {
  const image = await renderSocialImage(await solidPage())
  const metadata = await sharp(image.data).metadata()
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['jpeg', 1200, 630])
  assert.deepEqual([image.width, image.height], [SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT])

  const centre = await pixelAt(image.data, 600, 315)
  assert.ok(centre.r > 180 && centre.g < 60 && centre.b < 70, `page colour in the centre: ${JSON.stringify(centre)}`)
  // The page is fitted to the height (558px tall, about 395px wide), so the sides show the backdrop.
  const side = await pixelAt(image.data, 40, 315)
  assert.ok(side.r < centre.r - 25, `darker backdrop at the side: ${JSON.stringify(side)}`)
  // The top and bottom margins are backdrop too: the page is never cropped.
  const top = await pixelAt(image.data, 600, 10)
  assert.ok(top.r < centre.r - 25)
})

test('a landscape page is fitted inside the card as well', async () => {
  const image = await renderSocialImage(await solidPage({ width: 1600, height: 900, color: { r: 20, g: 60, b: 200 } }))
  const metadata = await sharp(image.data).metadata()
  assert.deepEqual([metadata.width, metadata.height], [1200, 630])
  const centre = await pixelAt(image.data, 600, 315)
  assert.ok(centre.b > 170 && centre.r < 60)
})

test('the image is kept under 300 KB, stepping the JPEG quality down when the page is busy', async () => {
  const page = await busyPage()
  const image = await renderSocialImage(page)
  assert.ok(image.data.length <= 300 * 1024, `${image.data.length} bytes`)
  // With an impossible budget every quality is tried and the smallest (last) one is kept.
  const smallest = await renderSocialImage(page, { maxBytes: 1 })
  assert.ok(smallest.data.length < image.data.length || image.data.length === smallest.data.length)
  assert.equal((await sharp(smallest.data).metadata()).width, 1200)
})

test('a page that is not an image is refused', async () => {
  await assert.rejects(renderSocialImage(Buffer.from('%PDF-1.7 not an image')))
})

// ---------- Generating and storing it ----------

test('the flipbook is claimed atomically, its first page rendered, stored privately under its social folder and recorded', async () => {
  const flipbookId = state.claimed._id
  assert.equal(await ensureSocialImage(flipbookId), 'created')

  const [filter, update, options] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter._id, flipbookId)
  assert.equal(filter.status, 'ready')
  assert.equal(filter.socialImage, null)
  assert.deepEqual(filter['socialImageGeneration.attempts'], { $not: { $gte: MAX_SOCIAL_IMAGE_ATTEMPTS } })
  assert.ok(filter['socialImageGeneration.leaseExpiresAt'].$not.$gt instanceof Date)
  assert.deepEqual(update.$inc, { 'socialImageGeneration.attempts': 1 })
  assert.ok(update.$set['socialImageGeneration.leaseExpiresAt'] > new Date())
  assert.deepEqual(options.projection, { ownerId: 1, pages: { $elemMatch: { pageNumber: 1 } } })

  // The stored first page record, not anything from a request.
  assert.equal(storage.fetchPageImage.mock.calls[0].arguments[0], state.claimed.pages[0])

  const [uploaded, publicId] = storage.uploadSocialImage.mock.calls[0].arguments
  assert.match(publicId, new RegExp(`^craftflip/users/${state.claimed.ownerId}/flipbooks/${flipbookId}/social/og-[0-9a-f-]{36}$`))
  const metadata = await sharp(uploaded).metadata()
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['jpeg', 1200, 630])

  const [saveFilter, saveUpdate] = flipbookModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(saveFilter, { _id: flipbookId, status: 'ready', socialImage: null })
  const record = saveUpdate.$set.socialImage
  assert.equal(record.publicId, publicId)
  assert.deepEqual([record.version, record.format, record.width, record.height, record.bytes], [5, 'jpg', 1200, 630, uploaded.length])
  assert.ok(record.createdAt instanceof Date)
  assert.equal(saveUpdate.$set['socialImageGeneration.leaseExpiresAt'], null)
  assert.equal(storage.deleteSocialImage.mock.callCount(), 0)
})

test('the claim outlasts the slowest possible generation, so a slow run is never claimed twice', async () => {
  const before = Date.now()
  await ensureSocialImage(state.claimed._id)
  const [, update] = flipbookModel.findOneAndUpdate.mock.calls[0].arguments
  // Page fetch timeout 30s + upload timeout 120s (utils/pdfStorage.js), plus room for rendering.
  const slowestRunMs = 30_000 + 120_000
  assert.ok(update.$set['socialImageGeneration.leaseExpiresAt'].getTime() - before > slowestRunMs + 60_000)
})

test('nothing is generated again when the flipbook already has an image, is being made, is not ready or is out of attempts', async () => {
  state.claimed = null
  assert.equal(await ensureSocialImage(new mongoose.Types.ObjectId()), 'not_needed')
  assert.equal(storage.fetchPageImage.mock.callCount(), 0)
  assert.equal(storage.uploadSocialImage.mock.callCount(), 0)
  assert.equal(flipbookModel.updateOne.mock.callCount(), 0)
})

test('a page that cannot be loaded fails quietly, stores nothing and allows a later retry', async () => {
  storage.fetchPageImage.mock.mockImplementationOnce(async () => {
    throw new Error('Cloudinary page delivery failed (http 500)')
  })
  const before = Date.now()
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')
  assert.equal(storage.uploadSocialImage.mock.callCount(), 0)
  const [filter, update] = flipbookModel.updateOne.mock.calls[0].arguments
  assert.deepEqual(filter, { _id: state.claimed._id })
  assert.deepEqual(Object.keys(update.$set), ['socialImageGeneration.leaseExpiresAt'])
  assert.ok(update.$set['socialImageGeneration.leaseExpiresAt'].getTime() >= before + 9 * 60 * 1000)
})

test('an unreadable page, a missing first page or a failed upload also fail quietly without a record', async () => {
  state.pageImage = Buffer.from('not an image')
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')

  state.pageImage = await solidPage()
  state.claimed = { ...claimedFlipbook(), pages: [] }
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')

  state.claimed = claimedFlipbook()
  storage.uploadSocialImage.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('upload failed'), { http_code: 420 })
  })
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')

  const records = flipbookModel.updateOne.mock.calls.filter((call) => call.arguments[1].$set.socialImage)
  assert.equal(records.length, 0)
})

test('if the flipbook was deleted or given an image meanwhile, the new file is removed again', async () => {
  state.saveMatched = 0
  assert.equal(await ensureSocialImage(state.claimed._id), 'not_needed')
  const publicId = storage.uploadSocialImage.mock.calls[0].arguments[1]
  assert.equal(storage.deleteSocialImage.mock.calls[0].arguments[0], publicId)
})

test('if saving the record fails, the uploaded file is kept rather than risk a record pointing at nothing', async () => {
  flipbookModel.updateOne.mock.mockImplementationOnce(async () => {
    throw new Error('connection reset')
  })
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')
  assert.equal(storage.deleteSocialImage.mock.callCount(), 0)
})

test('errors from the database or a failed retry note never escape', async () => {
  flipbookModel.findOneAndUpdate.mock.mockImplementationOnce(async () => {
    throw new Error('not connected')
  })
  assert.equal(await ensureSocialImage(new mongoose.Types.ObjectId()), 'failed')

  storage.fetchPageImage.mock.mockImplementationOnce(async () => {
    throw new Error('timeout')
  })
  flipbookModel.updateOne.mock.mockImplementationOnce(async () => {
    throw new Error('not connected')
  })
  assert.equal(await ensureSocialImage(state.claimed._id), 'failed')
})

test('without Cloudinary nothing is attempted', async () => {
  state.cloudinaryConfigured = false
  assert.equal(await ensureSocialImage(state.claimed._id), 'not_configured')
  assert.equal(flipbookModel.findOneAndUpdate.mock.callCount(), 0)
})

test('at most two generations run at once; others are skipped for a later request', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  storage.fetchPageImage.mock.mockImplementation(async () => {
    await gate
    return state.pageImage
  })
  const running = [ensureSocialImage(state.claimed._id), ensureSocialImage(state.claimed._id)]
  assert.equal(await ensureSocialImage(state.claimed._id), 'busy')
  release()
  assert.deepEqual(await Promise.all(running), ['created', 'created'])
  assert.equal(await ensureSocialImage(state.claimed._id), 'created')
})

test('needsSocialImage: only without an image, within the attempt limit and with no generation running', () => {
  const now = new Date('2026-10-18T10:00:00.000Z')
  assert.equal(needsSocialImage({}, now), true)
  assert.equal(needsSocialImage({ socialImage: null, socialImageGeneration: { attempts: 2, leaseExpiresAt: null } }, now), true)
  assert.equal(needsSocialImage({ socialImageGeneration: { attempts: 1, leaseExpiresAt: new Date('2026-10-18T09:59:00.000Z') } }, now), true)
  assert.equal(needsSocialImage({ socialImage: { publicId: 'x' } }, now), false)
  assert.equal(needsSocialImage({ socialImageGeneration: { attempts: MAX_SOCIAL_IMAGE_ATTEMPTS } }, now), false)
  assert.equal(needsSocialImage({ socialImageGeneration: { attempts: 1, leaseExpiresAt: new Date('2026-10-18T10:01:00.000Z') } }, now), false)
})
