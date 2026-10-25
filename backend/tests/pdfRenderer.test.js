import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PdfRenderError, openPdf } from '../utils/pdfRenderer.js'
import { makePdf } from './helpers/makePdf.js'

test('renders each page to a 1600px-wide WebP image, in order', async () => {
  const renderer = await openPdf(makePdf(3))
  try {
    assert.equal(renderer.pageCount, 3)
    for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
      const page = await renderer.renderPage(pageNumber)
      const metadata = await sharp(page.data).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(page.width, 1600)
      assert.equal(page.height, Math.round((842 * 1600) / 595))
      assert.equal(metadata.width, page.width)

      // The blue rectangle near the top was actually drawn, not a blank page.
      const { data } = await sharp(page.data).extract({ left: 800, top: 300, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      assert.ok(data[2] > data[0] + 60, 'expected a blue pixel inside the rectangle')
    }
  } finally {
    await renderer.close()
  }
})

test('a file that is not a parseable PDF is reported as unreadable', async () => {
  await assert.rejects(openPdf(Buffer.from('%PDF-1.4\nthis is not really a pdf')), (error) => {
    assert.ok(error instanceof PdfRenderError)
    assert.equal(error.code, 'unreadable')
    return true
  })
})

test('requests after close are rejected instead of hanging', async () => {
  const renderer = await openPdf(makePdf(1))
  await renderer.close()
  await assert.rejects(renderer.renderPage(1), PdfRenderError)
})

test('each rendered page brings its text for search, and text can be read without rendering', async () => {
  const renderer = await openPdf(makePdf(2))
  try {
    assert.equal((await renderer.renderPage(1)).text, 'Page 1')
    assert.equal(await renderer.readText(2), 'Page 2')
  } finally {
    await renderer.close()
  }
})
