import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Flipbook from '../models/Flipbook.js'

test('toSummary never exposes Cloudinary asset details', () => {
  const flipbook = new Flipbook({
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Brochure',
    slug: 'brochure-ab12',
    originalFile: { filename: 'brochure.pdf', sizeBytes: 1234 },
    pdfAsset: { publicId: 'craftflip/users/u/flipbooks/f/original.pdf', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  })

  const serialized = JSON.stringify(flipbook.toSummary())
  assert.doesNotMatch(serialized, /craftflip\/users|cloudinary|publicId|pdfAsset|ownerId/i)
  assert.equal(flipbook.toSummary().status, 'uploaded')
})

test('toSummary reports the conversion error but no page count or page image details for a failed flipbook', () => {
  const flipbook = new Flipbook({
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Brochure',
    slug: 'brochure-cd34',
    status: 'failed',
    originalFile: { filename: 'brochure.pdf', sizeBytes: 1234 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
    pages: [{ pageNumber: 1, publicId: 'craftflip/users/u/flipbooks/f/pages/a/page-001', version: 1, format: 'webp', width: 1600, height: 2263, bytes: 10 }],
    pageCount: 1,
    conversion: { attemptId: 'a', error: "This PDF couldn't be read. It may be damaged." },
  })

  const summary = flipbook.toSummary()
  assert.equal(summary.pageCount, null)
  assert.equal(summary.conversionError, "This PDF couldn't be read. It may be damaged.")
  assert.doesNotMatch(JSON.stringify(summary), /page-001|craftflip\/users|attemptId|pages"/)
})

test('toSummary reports the stored page count only once the flipbook is ready', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-ef56',
    originalFile: { filename: 'listing.pdf', sizeBytes: 3355443 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
    pageCount: 20,
  }

  assert.equal(new Flipbook({ ...fields, status: 'ready' }).toSummary().pageCount, 20)
  assert.equal(new Flipbook({ ...fields, status: 'processing' }).toSummary().pageCount, null)
  assert.equal(new Flipbook({ ...fields, status: 'uploaded', pageCount: null }).toSummary().pageCount, null)
})

test('toSummary reports publication only for a Ready flipbook', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-gh78',
    originalFile: { filename: 'listing.pdf', sizeBytes: 10 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
    isPublished: true,
    publishedAt: new Date('2026-10-15T10:00:00Z'),
  }

  const ready = new Flipbook({ ...fields, status: 'ready' }).toSummary()
  assert.equal(ready.isPublished, true)
  assert.equal(ready.publishedAt.toISOString(), '2026-10-15T10:00:00.000Z')

  const deleting = new Flipbook({ ...fields, status: 'deleting' }).toSummary()
  assert.equal(deleting.isPublished, false)
  assert.equal(deleting.publishedAt, null)
  assert.equal(new Flipbook({ ...fields, status: 'ready', isPublished: false }).toSummary().isPublished, false)
})

test('conversion progress is reported only while processing and stays below 100 percent', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-pq12',
    originalFile: { filename: 'listing.pdf', sizeBytes: 10 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  }
  const converting = new Flipbook({ ...fields, status: 'processing', conversion: { attemptId: 'a', stage: 'converting', totalPages: 20, completedPages: 12 } })
  assert.deepEqual(converting.toSummary().conversionProgress, { stage: 'converting', completedPages: 12, totalPages: 20, percent: 60 })

  const finishing = new Flipbook({ ...fields, status: 'processing', conversion: { attemptId: 'a', stage: 'finalizing', totalPages: 20, completedPages: 20 } })
  assert.equal(finishing.toSummary().conversionProgress.percent, 99)

  const queued = new Flipbook({ ...fields, status: 'processing', conversion: { attemptId: 'a', stage: 'queued' } })
  assert.deepEqual(queued.toSummary().conversionProgress, { stage: 'queued', completedPages: 0, totalPages: null, percent: 0 })

  for (const status of ['uploaded', 'ready', 'failed', 'deleting']) {
    const settled = new Flipbook({ ...fields, status, conversion: { attemptId: 'a', stage: 'converting', totalPages: 20, completedPages: 12 } })
    assert.equal(settled.toSummary().conversionProgress, null)
  }
})

test('new flipbooks use Luxury Flip; older records without a style, or with an unknown one, read as Luxury Flip', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-st34',
    originalFile: { filename: 'listing.pdf', sizeBytes: 10 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  }
  const fresh = new Flipbook(fields)
  assert.equal(fresh.viewerStyle, 'luxury-flip')
  assert.equal(fresh.toSummary().viewerStyle, 'luxury-flip')

  const older = new Flipbook(fields)
  older.viewerStyle = undefined
  assert.equal(older.toSummary().viewerStyle, 'luxury-flip')

  assert.equal(new Flipbook({ ...fields, viewerStyle: 'classic-book' }).toSummary().viewerStyle, 'classic-book')
  const invalid = new Flipbook({ ...fields, viewerStyle: 'neon' })
  assert.ok(invalid.validateSync()?.errors?.viewerStyle, 'the schema refuses unknown styles')
})

test('the summary says whether the flipbook was ever published, for the link-change warning', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-uv56',
    status: 'ready',
    originalFile: { filename: 'listing.pdf', sizeBytes: 10 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  }
  assert.equal(new Flipbook(fields).toSummary().hasBeenPublished, false)
  assert.equal(new Flipbook({ ...fields, firstPublishedAt: new Date() }).toSummary().hasBeenPublished, true)
})

test('reader settings default to the previous behaviour and the schema refuses invalid colours', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Listing',
    slug: 'listing-wx78',
    originalFile: { filename: 'listing.pdf', sizeBytes: 10 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  }
  assert.deepEqual(new Flipbook(fields).toSummary().reader, {
    primaryColor: null,
    background: { kind: 'default', color: null, preset: null, image: null },
    logo: null,
    cta: { enabled: false, label: '', url: '' },
    allowDownload: false,
    contents: [],
  })
  assert.ok(new Flipbook({ ...fields, reader: { primaryColor: 'red' } }).validateSync()?.errors?.['reader.primaryColor'])
  assert.ok(new Flipbook({ ...fields, reader: { background: { kind: 'video' } } }).validateSync()?.errors?.['reader.background.kind'])
  assert.ok(new Flipbook({ ...fields, reader: { background: { preset: 'elsewhere' } } }).validateSync()?.errors?.['reader.background.preset'])
  assert.ok(new Flipbook({ ...fields, reader: { background: { color: 'red' } } }).validateSync()?.errors?.['reader.background.color'])
  assert.equal(new Flipbook({ ...fields, reader: { background: { kind: 'preset', preset: 'warm-wood' } } }).validateSync(), undefined)
  // An older flipbook whose top-bar colour was set keeps working and no longer sends it.
  assert.equal('accentColor' in new Flipbook({ ...fields, reader: { accentColor: '#000000' } }).toSummary().reader, false)
  const withBackground = new Flipbook({
    ...fields,
    reader: { background: { kind: 'image', image: { publicId: 'secret-bg', version: 1, format: 'webp', width: 5, height: 5, tone: 'light', uploadedAt: new Date() } } },
  })
  assert.equal(withBackground.toSummary().reader.background.kind, 'image')
  assert.doesNotMatch(JSON.stringify(withBackground.toSummary()), /secret-bg/)
  const withContents = new Flipbook({ ...fields, reader: { contents: [{ title: 'Floor plans', page: 9 }, { title: 'Welcome', page: 1 }] } })
  assert.equal(withContents.validateSync(), undefined)
  assert.deepEqual(withContents.toSummary().reader.contents, [{ title: 'Welcome', page: 1 }, { title: 'Floor plans', page: 9 }])
  for (const entry of [{ title: '', page: 1 }, { title: 'x'.repeat(81), page: 1 }, { title: 'Welcome', page: 0 }, { title: 'Welcome', page: 1.5 }, { page: 2 }]) {
    assert.ok(new Flipbook({ ...fields, reader: { contents: [entry] } }).validateSync(), JSON.stringify(entry))
  }
  const tooMany = Array.from({ length: 51 }, (_, index) => ({ title: 'Section', page: index + 1 }))
  assert.ok(new Flipbook({ ...fields, reader: { contents: tooMany } }).validateSync()?.errors?.['reader.contents'])
  const withLogo = new Flipbook({ ...fields, reader: { logo: { publicId: 'secret-id', version: 1, format: 'webp', width: 5, height: 5, uploadedAt: new Date() } } })
  assert.doesNotMatch(JSON.stringify(withLogo.toSummary()), /secret-id/)
})

test('a flipbook starts without a social preview image, and toSummary never exposes it', () => {
  const fields = {
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Brochure',
    slug: 'brochure-og12',
    status: 'ready',
    originalFile: { filename: 'brochure.pdf', sizeBytes: 1234 },
    pdfAsset: { publicId: 'p', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  }
  const fresh = new Flipbook(fields)
  assert.equal(fresh.socialImage, null)
  assert.equal(fresh.socialImageGeneration.attempts, 0)
  assert.equal(fresh.validateSync(), undefined)

  const withImage = new Flipbook({
    ...fields,
    socialImage: { publicId: 'craftflip/users/u/flipbooks/f/social/og-1', version: 3, format: 'jpg', width: 1200, height: 630, bytes: 40000, createdAt: new Date() },
  })
  assert.equal(withImage.validateSync(), undefined)
  assert.doesNotMatch(JSON.stringify(withImage.toSummary()), /social|og-1|craftflip\/users/)
})
