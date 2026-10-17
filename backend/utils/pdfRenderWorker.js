import path from 'node:path'
import { parentPort } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { createCanvas } from '@napi-rs/canvas'
import sharp from 'sharp'
import { getDocument, InvalidPDFException, PasswordException, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Runs in a worker thread: PDF parsing and rasterizing is CPU-bound and would block Express.
// Several render requests can be in flight: while sharp encodes one page on libuv's thread pool,
// pdf.js can render the next (utils/pdfConversion.js keeps at most PAGE_CONCURRENCY in flight).

const PAGE_WIDTH_PX = 1600
const MAX_PAGE_SIDE_PX = 4000
const WEBP_QUALITY = 82

const pdfjsDir = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
// pdf.js reads these with fs and requires forward slashes with a trailing slash, also on Windows.
const pdfjsDataDir = (name) => `${path.join(pdfjsDir, name).replaceAll(path.sep, '/')}/`

let pdfDocument = null

async function openDocument(data) {
  try {
    pdfDocument = await getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: pdfjsDataDir('standard_fonts'),
      cMapUrl: pdfjsDataDir('cmaps'),
      cMapPacked: true,
      wasmUrl: pdfjsDataDir('wasm'),
      verbosity: VerbosityLevel.ERRORS,
    }).promise
  } catch (error) {
    if (error instanceof PasswordException) throw new Error('password')
    if (error instanceof InvalidPDFException || error.name === 'FormatError') throw new Error('unreadable')
    throw error
  }
  return { pageCount: pdfDocument.numPages }
}

// Pages render 1600px wide; unusually tall pages are scaled down so no side exceeds 4000px.
function scaleFor(viewport) {
  const widthScale = PAGE_WIDTH_PX / viewport.width
  return Math.min(widthScale, MAX_PAGE_SIDE_PX / Math.max(viewport.width, viewport.height))
}

async function renderPage(pageNumber) {
  const page = await pdfDocument.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: scaleFor(page.getViewport({ scale: 1 })) })
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise

    // Raw pixels go straight to sharp: a PNG round-trip here cost about 40% of the CPU time and
    // produced the same WebP bytes (checked on all 20 pages of a real brochure).
    const { data: pixels } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const raw = { width: canvas.width, height: canvas.height, channels: 4 }
    const image = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw })
      .flatten({ background: '#ffffff' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    const data = new Uint8Array(image.buffer, image.byteOffset, image.byteLength).slice()
    return { data, width: canvas.width, height: canvas.height }
  } finally {
    page.cleanup()
  }
}

parentPort.on('message', async ({ id, type, data, pageNumber }) => {
  try {
    const result = type === 'open' ? await openDocument(data) : await renderPage(pageNumber)
    parentPort.postMessage({ id, ok: true, result }, result.data ? [result.data.buffer] : [])
  } catch (error) {
    const code = ['password', 'unreadable'].includes(error.message) ? error.message : 'render-failed'
    parentPort.postMessage({ id, ok: false, error: code })
  }
})
