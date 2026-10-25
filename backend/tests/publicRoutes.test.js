import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import express from 'express'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const state = { cloudinaryConfigured: true, flipbook: null }

// A stored flipbook with private fields that must never reach a visitor.
const STORED = {
  _id: '6ad0f56609e219210a340819',
  ownerId: '6ad0d2d3a1fe9c5bd7ed9c97',
  slug: 'et-listing-presentation-x7k2',
  title: 'ET Listing Presentation',
  status: 'ready',
  isPublished: true,
  pageCount: 2,
  originalFile: { filename: 'ET Listing Presentation - Final 5.pdf', sizeBytes: 3355443 },
  pdfAsset: { publicId: 'craftflip/users/u/flipbooks/f/original.pdf' },
  pages: [
    { pageNumber: 2, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-002', version: 7, format: 'webp', width: 1600, height: 2071 },
    { pageNumber: 1, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-001', version: 7, format: 'webp', width: 1600, height: 2071 },
  ],
}

const flipbookModel = {
  findOne: mock.fn((filter) => ({
    select: async (projection) => {
      const flipbook = state.flipbook
      if (!flipbook || flipbook.slug !== filter.slug || flipbook.isPublished !== filter.isPublished || flipbook.status !== filter.status) return null
      if ('reader.allowDownload' in filter && flipbook.reader?.allowDownload !== filter['reader.allowDownload']) return null
      if ('reader.background.kind' in filter && flipbook.reader?.background?.kind !== filter['reader.background.kind']) return null
      const pageNumber = projection?.pages?.$elemMatch?.pageNumber
      return pageNumber === undefined ? flipbook : { ...flipbook, pages: flipbook.pages.filter((page) => page.pageNumber === pageNumber) }
    },
  })),
}

const storage = {
  openOriginalPdfStream: mock.fn(async () => ({ stream: Readable.toWeb(Readable.from([Buffer.from('%PDF-1.7 brochure')])), contentLength: 17 })),
  openPageImageStream: mock.fn(async () => ({ stream: Readable.toWeb(Readable.from([Buffer.from('RIFF'), Buffer.from('-page')])), contentLength: 9 })),
}

const viewSessionModel = { findOneAndUpdate: mock.fn(async () => ({ _id: 'session' })) }
mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: flipbookModel })
mock.module(moduleUrl('../models/ViewSession.js'), { defaultExport: viewSessionModel })
mock.module(moduleUrl('../config/cloudinary.js'), { namedExports: { getCloudinary: () => (state.cloudinaryConfigured ? {} : null) } })
mock.module(moduleUrl('../utils/pdfStorage.js'), {
  namedExports: {
    openPageImageStream: (...args) => storage.openPageImageStream(...args),
    openOriginalPdfStream: (...args) => storage.openOriginalPdfStream(...args),
  },
})

const socialImage = { ensureSocialImage: mock.fn(async () => 'created') }
mock.module(moduleUrl('../utils/socialImage.js'), {
  namedExports: {
    ensureSocialImage: (...args) => socialImage.ensureSocialImage(...args),
    needsSocialImage: (flipbook) => !flipbook.socialImage?.publicId && (flipbook.socialImageGeneration?.attempts ?? 0) < 3 && !(flipbook.socialImageGeneration?.leaseExpiresAt > new Date()),
  },
})

const { default: publicRoutes } = await import('../routes/publicRoutes.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

const app = express()
app.use(express.json())
app.use('/api/public', publicRoutes)
app.use(errorHandler)
const server = await startServer(app)
test.after(() => server.close())

const FORBIDDEN = /ownerId|6ad0d2d3a1fe9c5bd7ed9c97|6ad0f56609e219210a340819|_id|publicId|craftflip\/users|cloudinary|original|filename|sizeBytes|pdfAsset|version|email|firebase|token|status/i

function metadataRequest(slug, headers = {}) {
  return fetch(`${server.url}/api/public/flipbooks/${slug}`, { headers })
}

function imageRequest(slug, pageNumber) {
  return fetch(`${server.url}/api/public/flipbooks/${slug}/pages/${pageNumber}`)
}

beforeEach(() => {
  state.cloudinaryConfigured = true
  state.flipbook = structuredClone(STORED)
  flipbookModel.findOne.mock.resetCalls()
  storage.openPageImageStream.mock.resetCalls()
  storage.openOriginalPdfStream.mock.resetCalls()
  viewSessionModel.findOneAndUpdate.mock.resetCalls()
  socialImage.ensureSocialImage.mock.resetCalls()
})

test('a published flipbook returns only title, slug, viewing style, reader settings, page count and ordered page sizes, without sign-in', async () => {
  const response = await metadataRequest(STORED.slug)
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.doesNotMatch(text, FORBIDDEN)
  assert.deepEqual(JSON.parse(text), {
    success: true,
    data: {
      flipbook: {
        slug: STORED.slug,
        title: STORED.title,
        viewerStyle: 'luxury-flip',
        reader: { primaryColor: null, background: { kind: 'default' }, logo: null, cta: null, allowDownload: false, contents: [] },
        pageCount: 2,
        pages: [
          { pageNumber: 1, width: 1600, height: 2071 },
          { pageNumber: 2, width: 1600, height: 2071 },
        ],
        socialImage: null,
      },
    },
  })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')

  const [filter] = flipbookModel.findOne.mock.calls[0].arguments
  assert.deepEqual(filter, { slug: STORED.slug, isPublished: true, status: 'ready' })
})

test('an Authorization header is ignored by the public API', async () => {
  const response = await metadataRequest(STORED.slug, { Authorization: 'Bearer not-a-real-token' })
  assert.equal(response.status, 200)
})

test('unpublished, deleting, unconverted, missing and malformed slugs get the identical 404', async () => {
  const responses = []
  for (const change of [{ isPublished: false }, { status: 'deleting', isPublished: false }, { status: 'deleting' }, { status: 'processing' }]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    responses.push(await metadataRequest(STORED.slug))
  }
  responses.push(await metadataRequest('no-such-flipbook-zz99'))
  for (const slug of ['Upper-Case', 'dots.in.slug', '-leading', 'a--b', 'x'.repeat(81), '%20']) {
    responses.push(await metadataRequest(slug))
  }

  for (const response of responses) {
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { success: false, message: 'Flipbook not found.' })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  // Malformed slugs are refused before any database lookup.
  assert.equal(flipbookModel.findOne.mock.callCount(), 5)
})

test('a published page is streamed with the browser-only five-minute cache policy', async () => {
  const response = await imageRequest(STORED.slug, 2)
  assert.equal(response.status, 200)
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'RIFF-page')
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')

  // The image to fetch comes from the verified database record, never from the request.
  const [page] = storage.openPageImageStream.mock.calls[0].arguments
  assert.equal(page.publicId, 'craftflip/users/u/flipbooks/f/pages/a/page-002')
  const [filter, ] = flipbookModel.findOne.mock.calls[0].arguments
  assert.deepEqual(filter, { slug: STORED.slug, isPublished: true, status: 'ready' })
})

test('invalid page numbers are rejected without fetching anything', async () => {
  for (const pageNumber of ['0', '-1', '1.5', 'abc', '3', '999', '1e3', '%2F%2Fevil.example']) {
    const response = await imageRequest(STORED.slug, pageNumber)
    assert.equal(response.status, 404, `page ${pageNumber}`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  assert.equal(storage.openPageImageStream.mock.callCount(), 0)
})

test('request input cannot choose what the server fetches', async () => {
  const attempts = [
    `${server.url}/api/public/flipbooks/${STORED.slug}/pages/1?url=http://169.254.169.254/`,
    `${server.url}/api/public/flipbooks/http%3A%2F%2Fevil.example/pages/1`,
    `${server.url}/api/public/flipbooks/..%2F..%2Fapi%2Fflipbooks/pages/1`,
  ]
  const responses = await Promise.all(attempts.map((url) => fetch(url)))
  assert.equal(responses[0].status, 200)
  assert.equal(responses[1].status, 404)
  assert.equal(responses[2].status, 404)
  assert.equal(storage.openPageImageStream.mock.callCount(), 1)
  assert.equal(storage.openPageImageStream.mock.calls[0].arguments[0].publicId, 'craftflip/users/u/flipbooks/f/pages/a/page-001')
})

test('pages of unpublished or deleting flipbooks are not served', async () => {
  for (const change of [{ isPublished: false }, { status: 'deleting', isPublished: false }, { status: 'deleting' }]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    const response = await imageRequest(STORED.slug, 1)
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), FORBIDDEN)
    // Previews follow exactly the same publication checks.
    assert.equal((await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/pages/1?size=thumb`)).status, 404)
  }
  assert.equal(storage.openPageImageStream.mock.callCount(), 0)
})

test('a published page preview is streamed with ?size=thumb; other sizes are refused before any lookup', async () => {
  const thumb = await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/pages/2?size=thumb`)
  assert.equal(thumb.status, 200)
  assert.equal(thumb.headers.get('content-type'), 'image/webp')
  assert.equal(thumb.headers.get('cache-control'), 'private, max-age=300')
  const [page, variant] = storage.openPageImageStream.mock.calls[0].arguments
  assert.equal(page.publicId, 'craftflip/users/u/flipbooks/f/pages/a/page-002')
  assert.equal(variant, 'thumb')
  assert.equal((await imageRequest(STORED.slug, 1)).status, 200)
  assert.equal(storage.openPageImageStream.mock.calls[1].arguments[1], 'full')

  const lookups = flipbookModel.findOne.mock.callCount()
  for (const size of ['full', 'w_4000,h_4000', 'THUMB', '']) {
    const refused = await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/pages/1?size=${encodeURIComponent(size)}`)
    assert.equal(refused.status, 404, size)
  }
  assert.equal(flipbookModel.findOne.mock.callCount(), lookups)
  assert.equal(storage.openPageImageStream.mock.callCount(), 2)
})

test('a Cloudinary failure is a 502 without details; missing configuration is a 503', async () => {
  storage.openPageImageStream.mock.mockImplementationOnce(async () => {
    throw new Error('Cloudinary page delivery failed (http 401)')
  })
  const failed = await imageRequest(STORED.slug, 1)
  assert.equal(failed.status, 502)
  assert.deepEqual(await failed.json(), { success: false, message: "We couldn't load this page. Please try again." })

  state.cloudinaryConfigured = false
  assert.equal((await imageRequest(STORED.slug, 1)).status, 503)
})

test("the public viewer gets the flipbook's saved style, and an unknown stored value falls back to Luxury Flip", async () => {
  state.flipbook = { ...structuredClone(STORED), viewerStyle: 'editorial' }
  const response = await metadataRequest(STORED.slug)
  const text = await response.text()
  assert.equal(JSON.parse(text).data.flipbook.viewerStyle, 'editorial')
  assert.doesNotMatch(text, FORBIDDEN)

  state.flipbook = { ...structuredClone(STORED), viewerStyle: 'something-old' }
  assert.equal((await (await metadataRequest(STORED.slug)).json()).data.flipbook.viewerStyle, 'luxury-flip')

  // Changing the style never makes an unpublished flipbook visible.
  state.flipbook = { ...structuredClone(STORED), viewerStyle: 'clean-swipe', isPublished: false }
  assert.equal((await metadataRequest(STORED.slug)).status, 404)
})

test('the public reader settings are filtered: no logo storage details, the button only when shown', async () => {
  state.flipbook = {
    ...structuredClone(STORED),
    reader: {
      primaryColor: '#1f4e79',
      accentColor: '#000000',
      background: { kind: 'preset', color: '#123456', preset: 'warm-wood', image: { publicId: 'craftflip/users/u/flipbooks/f/branding/background-1', version: 5, format: 'webp', width: 2560, height: 1440, tone: 'dark', uploadedAt: new Date() } },
      logo: { publicId: 'craftflip/users/u/flipbooks/f/branding/logo-1', version: 4, format: 'webp', width: 320, height: 80, uploadedAt: new Date('2026-10-16T10:00:00Z') },
      cta: { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' },
      allowDownload: true,
      contents: [
        { title: 'Gallery', page: 2, _id: '6ad0f56609e219210a340820' },
        { title: 'Welcome', page: 1 },
        { title: 'Beyond the book', page: 3 },
      ],
    },
  }
  const response = await metadataRequest(STORED.slug)
  const text = await response.text()
  assert.doesNotMatch(text, FORBIDDEN)
  assert.deepEqual(JSON.parse(text).data.flipbook.reader, {
    primaryColor: '#1f4e79',
    background: { kind: 'preset', preset: 'warm-wood', tone: 'light' },
    logo: { width: 320, height: 80, revision: Date.parse('2026-10-16T10:00:00Z') },
    cta: { label: 'Book a viewing', url: 'https://agency.example/book' },
    allowDownload: true,
    contents: [
      { title: 'Welcome', page: 1 },
      { title: 'Gallery', page: 2 },
    ],
  })
})

test('the original PDF downloads only when the flipbook is published and the owner allows it', async () => {
  state.flipbook = { ...structuredClone(STORED), reader: { allowDownload: true } }
  const allowed = await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/download`)
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('content-type'), 'application/pdf')
  assert.equal(allowed.headers.get('content-disposition'), `attachment; filename="${STORED.slug}.pdf"`)
  assert.equal(allowed.headers.get('cache-control'), 'no-store')
  assert.equal(Buffer.from(await allowed.arrayBuffer()).toString(), '%PDF-1.7 brochure')
  const [filter] = flipbookModel.findOne.mock.calls.at(-1).arguments
  assert.deepEqual(filter, { slug: STORED.slug, isPublished: true, status: 'ready', 'reader.allowDownload': true })
  assert.equal(storage.openOriginalPdfStream.mock.calls[0].arguments[0], STORED.pdfAsset.publicId)

  for (const change of [
    { reader: { allowDownload: false } },
    { reader: undefined },
    { reader: { allowDownload: true }, isPublished: false },
    { reader: { allowDownload: true }, status: 'deleting', isPublished: false },
    { reader: { allowDownload: true }, status: 'deleting' },
  ]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    const refused = await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/download`)
    assert.equal(refused.status, 404, JSON.stringify(change))
    assert.deepEqual(await refused.json(), { success: false, message: 'Flipbook not found.' })
  }
  assert.equal((await fetch(`${server.url}/api/public/flipbooks/Not-A-Slug/download`)).status, 404)
  assert.equal(storage.openOriginalPdfStream.mock.callCount(), 1)
})

test('the logo of a published flipbook is served like its pages; otherwise 404', async () => {
  state.flipbook = { ...structuredClone(STORED), reader: { logo: { publicId: 'logo-id', version: 2, format: 'webp', width: 10, height: 10, uploadedAt: new Date() } } }
  const response = await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/logo`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(storage.openPageImageStream.mock.calls[0].arguments[0].publicId, 'logo-id')

  state.flipbook = { ...structuredClone(STORED), isPublished: false, reader: { logo: { publicId: 'logo-id' } } }
  assert.equal((await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/logo`)).status, 404)
  state.flipbook = structuredClone(STORED)
  assert.equal((await fetch(`${server.url}/api/public/flipbooks/${STORED.slug}/logo`)).status, 404)
})

test('an uploaded background is served only while published and chosen; otherwise 404', async () => {
  const image = { publicId: 'craftflip/users/u/flipbooks/f/branding/background-1', version: 2, format: 'webp', width: 2560, height: 1440, tone: 'dark', uploadedAt: new Date() }
  const backgroundUrl = `${server.url}/api/public/flipbooks/${STORED.slug}/background`
  state.flipbook = { ...structuredClone(STORED), reader: { background: { kind: 'image', image } } }
  const response = await fetch(backgroundUrl)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(storage.openPageImageStream.mock.calls[0].arguments[0].publicId, image.publicId)
  const [filter] = flipbookModel.findOne.mock.calls.at(-1).arguments
  assert.deepEqual(filter, { slug: STORED.slug, isPublished: true, status: 'ready', 'reader.background.kind': 'image' })

  const metadata = await (await metadataRequest(STORED.slug)).text()
  assert.doesNotMatch(metadata, FORBIDDEN)
  assert.deepEqual(JSON.parse(metadata).data.flipbook.reader.background, { kind: 'image', revision: image.uploadedAt.getTime(), tone: 'dark' })

  for (const change of [
    { reader: { background: { kind: 'preset', preset: 'warm-wood', image } } },
    { reader: { background: { kind: 'image', image: null } } },
    { reader: undefined },
    { isPublished: false, reader: { background: { kind: 'image', image } } },
    { status: 'deleting', reader: { background: { kind: 'image', image } } },
  ]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    const refused = await fetch(backgroundUrl)
    assert.equal(refused.status, 404, JSON.stringify(change))
    assert.deepEqual(await refused.json(), { success: false, message: 'Flipbook not found.' })
  }
  assert.equal(storage.openPageImageStream.mock.callCount(), 1)
})

// ---------- Social preview image (Milestone 13) ----------

const SOCIAL_IMAGE = {
  publicId: 'craftflip/users/u/flipbooks/f/social/og-1',
  version: 4,
  format: 'jpg',
  width: 1200,
  height: 630,
  bytes: 48211,
  createdAt: new Date('2026-10-18T09:00:00.000Z'),
}
const socialImageUrl = (slug = STORED.slug) => `${server.url}/api/public/flipbooks/${slug}/social-image`

test('the metadata names the social preview image by size and revision only, and starts nothing when it exists', async () => {
  state.flipbook = { ...structuredClone(STORED), socialImage: SOCIAL_IMAGE }
  const response = await metadataRequest(STORED.slug)
  const text = await response.text()
  assert.doesNotMatch(text, FORBIDDEN)
  assert.doesNotMatch(text, /social\/og|jpg|bytes/)
  assert.deepEqual(JSON.parse(text).data.flipbook.socialImage, { width: 1200, height: 630, revision: SOCIAL_IMAGE.createdAt.getTime() })
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 0)
})

test('a published flipbook without a social preview image reports null and gets one in the background', async () => {
  socialImage.ensureSocialImage.mock.mockImplementationOnce(() => new Promise(() => {}))
  const response = await metadataRequest(STORED.slug)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.flipbook.socialImage, null)
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 1)
  assert.equal(socialImage.ensureSocialImage.mock.calls[0].arguments[0], STORED._id)

  // Out of attempts, or another request is making it: no new attempt.
  for (const socialImageGeneration of [{ attempts: 3, leaseExpiresAt: null }, { attempts: 1, leaseExpiresAt: new Date(Date.now() + 60_000) }]) {
    state.flipbook = { ...structuredClone(STORED), socialImageGeneration }
    assert.equal((await (await metadataRequest(STORED.slug)).json()).data.flipbook.socialImage, null)
  }
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 1)

  // Unpublished: the usual 404 and nothing started.
  state.flipbook = { ...structuredClone(STORED), isPublished: false }
  assert.equal((await metadataRequest(STORED.slug)).status, 404)
  assert.equal(socialImage.ensureSocialImage.mock.callCount(), 1)
})

test('the social preview image of a published flipbook is streamed as a JPEG from its own stored file', async () => {
  state.flipbook = { ...structuredClone(STORED), socialImage: SOCIAL_IMAGE }
  const response = await fetch(socialImageUrl())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await response.text(), 'RIFF-page')
  const [filter] = flipbookModel.findOne.mock.calls.at(-1).arguments
  assert.deepEqual(filter, { slug: STORED.slug, isPublished: true, status: 'ready' })
  // Only the preview image itself: never a page image or the original PDF.
  assert.deepEqual(storage.openPageImageStream.mock.calls.map((call) => call.arguments[0].publicId), [SOCIAL_IMAGE.publicId])
  assert.equal(storage.openOriginalPdfStream.mock.callCount(), 0)
})

test('the social preview image is 404 unless the flipbook is published and has one; private files are never sent instead', async () => {
  for (const change of [
    { isPublished: false, socialImage: SOCIAL_IMAGE },
    { status: 'deleting', isPublished: false, socialImage: SOCIAL_IMAGE },
    { status: 'processing', socialImage: SOCIAL_IMAGE },
    { socialImage: null },
    {},
  ]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    const refused = await fetch(socialImageUrl())
    assert.equal(refused.status, 404, JSON.stringify(change))
    assert.deepEqual(await refused.json(), { success: false, message: 'Flipbook not found.' })
    assert.equal(refused.headers.get('cache-control'), 'no-store')
  }
  const lookups = flipbookModel.findOne.mock.callCount()
  for (const slug of ['Upper-Case', 'a--b', '%2e%2e']) assert.equal((await fetch(socialImageUrl(slug))).status, 404)
  assert.equal(flipbookModel.findOne.mock.callCount(), lookups)
  assert.equal(storage.openPageImageStream.mock.callCount(), 0)
  assert.equal(storage.openOriginalPdfStream.mock.callCount(), 0)
})

test('a Cloudinary failure for the social preview image is a 502 without details; missing configuration is a 503', async () => {
  state.flipbook = { ...structuredClone(STORED), socialImage: SOCIAL_IMAGE }
  storage.openPageImageStream.mock.mockImplementationOnce(async () => {
    throw new Error('Cloudinary page delivery failed (http 500)')
  })
  const failed = await fetch(socialImageUrl())
  assert.equal(failed.status, 502)
  assert.deepEqual(await failed.json(), { success: false, message: "We couldn't load the preview image. Please try again." })

  state.cloudinaryConfigured = false
  const unconfigured = await fetch(socialImageUrl())
  assert.equal(unconfigured.status, 503)
  assert.doesNotMatch(await unconfigured.text(), /cloudinary|craftflip\/users/i)
})


test('a normal reading session is not rate limited, and the metadata limit returns a structured 429', async () => {
  // Three full reads of a 50-page flipbook from one address.
  for (let request = 0; request < 150; request++) {
    assert.equal((await imageRequest(STORED.slug, 1)).status, 200)
  }

  const first = await metadataRequest(STORED.slug)
  const remaining = Number(/r=(\d+)/.exec(first.headers.get('ratelimit'))[1])
  for (let request = 0; request < remaining; request++) await metadataRequest(STORED.slug)
  const limited = await metadataRequest(STORED.slug)
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), { success: false, message: 'Too many requests. Please try again in a few minutes.' })
})


// ---------- Analytics activity (Milestone 10) ----------

const VISITOR = '0f8fad5b-d9cb-469f-a165-70867728950e'
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'

function activityRequest(body, { slug = STORED.slug, type = 'text/plain;charset=UTF-8', userAgent = BROWSER, headers = {} } = {}) {
  return fetch(`${server.url}/api/public/flipbooks/${slug}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'User-Agent': userAgent, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('a visit to a published flipbook is recorded against that flipbook and its owner, and nothing is returned', async () => {
  const response = await activityRequest({ visitorId: VISITOR, pages: [2, 1], referrer: 'https://www.agency.example/listings?id=42', embedded: true })
  assert.equal(response.status, 204)
  assert.equal(await response.text(), '')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const [filter, update, options] = viewSessionModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(filter.flipbookId, STORED._id)
  assert.equal(filter.visitorId, VISITOR)
  assert.ok(filter.lastSeenAt.$gte instanceof Date)
  assert.deepEqual(update.$addToSet, { pagesViewed: { $each: [1, 2] } })
  assert.equal(update.$setOnInsert.ownerId, STORED.ownerId)
  assert.equal(update.$setOnInsert.deviceType, 'mobile')
  assert.equal(update.$setOnInsert.referrerHost, 'agency.example')
  assert.equal(update.$setOnInsert.embedded, true)
  assert.equal(options.upsert, true)
  // No address, user agent or full referrer is stored.
  assert.doesNotMatch(JSON.stringify(update), /127\.0\.0\.1|::1|iPhone|listings|id=42/)
  // The public lookup is the usual published, Ready filter.
  assert.deepEqual(flipbookModel.findOne.mock.calls.at(-1).arguments[0], { slug: STORED.slug, isPublished: true, status: 'ready' })
})

test('country is not collected: country headers a client can send are ignored and nothing is guessed', async () => {
  const spoofed = { 'X-Vercel-IP-Country': 'DE', 'CF-IPCountry': 'FR', 'CloudFront-Viewer-Country': 'GB', 'X-Country-Code': 'US', 'X-Railway-Edge': 'asia-southeast1' }
  const response = await activityRequest({ visitorId: VISITOR, pages: [1] }, { headers: spoofed })
  assert.equal(response.status, 204)
  const [, update] = viewSessionModel.findOneAndUpdate.mock.calls[0].arguments
  assert.equal(update.$setOnInsert.country, null)
  assert.doesNotMatch(JSON.stringify(update), /"(DE|FR|GB|US)"|asia-southeast1/)
  const withBodyField = await activityRequest({ visitorId: VISITOR, country: 'DE' })
  assert.equal(withBodyField.status, 400)
  assert.equal(viewSessionModel.findOneAndUpdate.mock.callCount(), 1)
})

test('a JSON body is accepted too', async () => {
  const response = await activityRequest({ visitorId: VISITOR }, { type: 'application/json' })
  assert.equal(response.status, 204)
  assert.equal(viewSessionModel.findOneAndUpdate.mock.callCount(), 1)
})

test('unpublished, deleting, missing and malformed slugs record nothing', async () => {
  for (const change of [{ isPublished: false }, { status: 'deleting', isPublished: false }, { status: 'deleting' }, { status: 'processing' }]) {
    state.flipbook = { ...structuredClone(STORED), ...change }
    const response = await activityRequest({ visitorId: VISITOR, pages: [1] })
    assert.equal(response.status, 404, JSON.stringify(change))
  }
  state.flipbook = structuredClone(STORED)
  assert.equal((await activityRequest({ visitorId: VISITOR }, { slug: 'no-such-book-ab12' })).status, 404)
  assert.equal((await activityRequest({ visitorId: VISITOR }, { slug: 'Not_A_Slug' })).status, 404)
  assert.equal(viewSessionModel.findOneAndUpdate.mock.callCount(), 0)
})

test('malformed, oversized and out-of-range reports are refused and record nothing', async () => {
  const bodies = [
    'not json',
    '{"visitorId":',
    { visitorId: 'abc' },
    { visitorId: VISITOR, pages: [3] },
    { visitorId: VISITOR, pages: [0] },
    { visitorId: VISITOR, ownerId: STORED.ownerId },
    { visitorId: VISITOR, embedded: 'yes' },
  ]
  for (const body of bodies) {
    const response = await activityRequest(body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.equal((await response.json()).success, false)
  }
  const huge = await activityRequest({ visitorId: VISITOR, referrer: `https://a.example/${'x'.repeat(5000)}` })
  assert.equal(huge.status, 413)
  assert.equal(viewSessionModel.findOneAndUpdate.mock.callCount(), 0)
})

test('crawlers and requests without a user agent are not counted', async () => {
  for (const userAgent of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'facebookexternalhit/1.1', 'curl/8.4.0', '']) {
    const response = await activityRequest({ visitorId: VISITOR, pages: [1] }, { userAgent })
    assert.equal(response.status, 204, userAgent)
  }
  assert.equal(viewSessionModel.findOneAndUpdate.mock.callCount(), 0)
})

test('a failed analytics write never surfaces to the reader', async () => {
  viewSessionModel.findOneAndUpdate.mock.mockImplementationOnce(async () => {
    throw new Error('MongoServerError: write failed')
  })
  const response = await activityRequest({ visitorId: VISITOR, pages: [1] })
  assert.equal(response.status, 204)
})

test('activity reports are rate limited per address with a structured 429', async () => {
  const first = await activityRequest({ visitorId: VISITOR })
  const remaining = Number(/r=(\d+)/.exec(first.headers.get('ratelimit'))[1])
  for (let request = 0; request < remaining; request++) await activityRequest({ visitorId: VISITOR })
  const limited = await activityRequest({ visitorId: VISITOR })
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), { success: false, message: 'Too many requests. Please try again in a few minutes.' })
})
