import Flipbook from '../models/Flipbook.js'
import { getCloudinary } from '../config/cloudinary.js'
import { MAX_PDF_SIZE_BYTES, hasPdfSignature } from './pdfFile.js'
import { PdfRenderError, openPdf } from './pdfRenderer.js'
import { deletePageImages, downloadPdf, pageFolder, pagePublicId, uploadPageImage } from './pdfStorage.js'
import { ensureSocialImage } from './socialImage.js'
import { removeFlipbookText, saveFlipbookText } from './textSearch.js'

// One conversion at a time keeps memory predictable on a single Railway instance.
const MAX_ACTIVE_CONVERSIONS = 1
const MAX_QUEUED_CONVERSIONS = 20
const CONVERSION_TIMEOUT_MS = 10 * 60 * 1000
// Pages in flight at once: each is rendered by the single PDF worker (which can render the next
// page while sharp encodes the previous one off-thread) and then uploaded. Three keeps at most
// three page canvases in memory and three Cloudinary uploads open. Measured on the 20-page
// brochure: see REFERENCE.md, "PDF processing pipeline".
export const PAGE_CONCURRENCY = 3
// Progress is saved at most this often (plus once when the last page is done).
const PROGRESS_WRITE_INTERVAL_MS = 1000

// Stages shown to the owner while status is processing. queued: claimed, waiting for a free
// conversion slot. preparing: downloading and opening the PDF. converting: pages are being
// rendered and uploaded; a page counts as done only once its image is stored. finalizing:
// saving the page list.
export const CONVERSION_STAGES = ['queued', 'preparing', 'converting', 'finalizing']

export const CONVERSION_MESSAGES = {
  password: 'This PDF is password protected. Remove the password and upload it again.',
  unreadable: "This PDF couldn't be read. It may be damaged.",
  timeout: 'Converting this PDF took too long. Please try again.',
  interrupted: 'Conversion was interrupted. Please try again.',
  generic: "We couldn't convert this PDF. Please try again.",
}

// An error whose message is safe to show the user.
class ConversionError extends Error {}

const queue = []
let activeConversions = 0

function userMessageFor(error, timedOut) {
  if (timedOut) return CONVERSION_MESSAGES.timeout
  if (error instanceof ConversionError) return error.message
  if (error instanceof PdfRenderError && error.code === 'password') return CONVERSION_MESSAGES.password
  if (error instanceof PdfRenderError && error.code === 'unreadable') return CONVERSION_MESSAGES.unreadable
  return CONVERSION_MESSAGES.generic
}

async function removePageImages(folder) {
  try {
    await deletePageImages(folder)
  } catch (error) {
    console.error(`Orphaned Cloudinary page images need manual removal: ${folder}/ (${error.name})`)
  }
}

// Every write is conditional on the attempt ID, so an attempt that was superseded
// (for example marked interrupted) can never overwrite newer state.
function updateAttempt(flipbook, update) {
  const filter = { _id: flipbook._id, status: 'processing', 'conversion.attemptId': flipbook.conversion.attemptId }
  return Flipbook.updateOne(filter, { $set: update })
}

// Saves the attempt's progress for the dashboard. Writes go out one at a time in order, are
// conditional on the attempt like every other write, and never move completedPages backwards.
// A failed progress write is logged and does not affect the conversion.
function createProgressReporter(flipbook) {
  const filter = { _id: flipbook._id, status: 'processing', 'conversion.attemptId': flipbook.conversion.attemptId }
  let chain = Promise.resolve()
  let lastWriteAt = 0

  function write(update) {
    lastWriteAt = Date.now()
    chain = chain
      .then(() => Flipbook.updateOne(filter, update))
      .catch((error) => console.error(`Progress update failed for flipbook ${flipbook._id}: ${error.name}`))
    return chain
  }

  return {
    stage(stage, fields = {}) {
      return write({ $set: { 'conversion.stage': stage, ...fields } })
    },
    pagesDone(completedPages, totalPages) {
      if (completedPages < totalPages && Date.now() - lastWriteAt < PROGRESS_WRITE_INTERVAL_MS) return chain
      return write({ $max: { 'conversion.completedPages': completedPages } })
    },
    flush() {
      return chain
    },
  }
}

// Renders and uploads every page with at most PAGE_CONCURRENCY pages in flight. Pages may finish
// in any order; each result is stored at its own index, so the page list is always in reading
// order. onPageText(pageNumber, text) receives each page's text for search. On the first failure
// no new page is started, and the function waits for pages already in flight to settle before
// throwing, so no upload can land after the caller's cleanup.
export async function renderAndStorePages(renderer, folder, { isTimedOut, onPageDone, onPageText = () => {} }) {
  const pages = new Array(renderer.pageCount)
  let nextPageNumber = 1
  let completed = 0
  let firstError = null

  async function convertPages() {
    while (!firstError && nextPageNumber <= renderer.pageCount) {
      const pageNumber = nextPageNumber++
      try {
        if (isTimedOut()) throw new ConversionError(CONVERSION_MESSAGES.timeout)
        const image = await renderer.renderPage(pageNumber)
        onPageText(pageNumber, image.text ?? '')
        const asset = await uploadPageImage(image.data, pagePublicId(folder, pageNumber))
        pages[pageNumber - 1] = {
          pageNumber,
          publicId: asset.public_id,
          version: asset.version,
          format: asset.format,
          width: image.width,
          height: image.height,
          bytes: asset.bytes,
        }
        completed++
        onPageDone(completed, renderer.pageCount)
      } catch (error) {
        firstError ??= error
      }
    }
  }

  const workerCount = Math.min(PAGE_CONCURRENCY, renderer.pageCount)
  await Promise.all(Array.from({ length: workerCount }, convertPages))
  if (firstError) throw firstError
  return pages
}

// Converts a flipbook already claimed as "processing" by the caller. Never throws: the
// outcome is written to the flipbook as status ready or failed. pdf, when given, is the original
// still in memory from the upload; otherwise it is downloaded from Cloudinary (retries, restarts).
export async function runConversion(flipbook, { maxPages, pdf: uploadedPdf = null }) {
  const folder = pageFolder(flipbook.ownerId, flipbook._id, flipbook.conversion.attemptId)
  let renderer = null
  let timedOut = false
  let pagesStarted = false
  const progress = createProgressReporter(flipbook)
  const timings = {}
  let stepStartedAt = Date.now()
  const endStep = (name) => {
    timings[name] = Date.now() - stepStartedAt
    stepStartedAt = Date.now()
  }
  const deadline = setTimeout(() => {
    timedOut = true
    renderer?.close()
  }, CONVERSION_TIMEOUT_MS)

  try {
    progress.stage('preparing')
    const pdf = uploadedPdf ?? (await downloadPdf(flipbook.pdfAsset.publicId))
    if (!hasPdfSignature(pdf) || pdf.length > MAX_PDF_SIZE_BYTES) throw new ConversionError(CONVERSION_MESSAGES.unreadable)
    endStep(uploadedPdf ? 'original in memory' : 'download')

    renderer = await openPdf(pdf)
    if (renderer.pageCount < 1) throw new ConversionError(CONVERSION_MESSAGES.unreadable)
    if (renderer.pageCount > maxPages) {
      throw new ConversionError(`This PDF has ${renderer.pageCount} pages. Your plan allows up to ${maxPages} pages.`)
    }
    endStep('open')

    pagesStarted = true
    progress.stage('converting', { 'conversion.totalPages': renderer.pageCount, 'conversion.completedPages': 0 })
    const texts = new Array(renderer.pageCount).fill('')
    const pages = await renderAndStorePages(renderer, folder, {
      isTimedOut: () => timedOut,
      onPageDone: (completed, total) => progress.pagesDone(completed, total),
      onPageText: (pageNumber, text) => {
        texts[pageNumber - 1] = text
      },
    })
    endStep('pages')
    progress.stage('finalizing')
    // The page text for search (text search, October 2026) is stored before the flipbook becomes
    // Ready. If storing it fails, the flipbook is still made Ready and its text is read again from
    // the stored PDF on first use (utils/textSearch.js).
    let textStatus = null
    try {
      textStatus = await saveFlipbookText(flipbook, flipbook.conversion.attemptId, texts)
    } catch (error) {
      console.error(`Search text could not be saved for flipbook ${flipbook._id}: ${error.name}`)
    }
    // Progress writes are conditional on status processing, so they must all land before the
    // final write; otherwise none could follow it anyway.
    await progress.flush()
    const result = await updateAttempt(flipbook, {
      status: 'ready',
      pageCount: pages.length,
      pages,
      'conversion.completedAt': new Date(),
      'conversion.error': null,
      textSearch: { status: textStatus, attemptId: textStatus ? flipbook.conversion.attemptId : null, attempts: 0, leaseExpiresAt: null },
    })
    if (result.matchedCount === 0) {
      await removePageImages(folder)
      if (textStatus === 'ready') await removeFlipbookText(flipbook._id, flipbook.conversion.attemptId)
    }
    // The social preview image (Milestone 13) is made from the stored first page once the
    // flipbook is ready, without holding up the queue. Its failure never fails the conversion.
    else ensureSocialImage(flipbook._id)
    endStep('save')
    const totalSeconds = Object.values(timings).reduce((sum, ms) => sum + ms, 0) / 1000
    const steps = Object.entries(timings).map(([name, ms]) => `${name} ${(ms / 1000).toFixed(1)}s`).join(', ')
    console.log(`Converted flipbook ${flipbook._id}: ${pages.length} pages in ${totalSeconds.toFixed(1)}s (${steps})`)
  } catch (error) {
    // Cloudinary and pdf.js error text can include internal details, so only the type is logged.
    console.error(`Conversion failed for flipbook ${flipbook._id}: ${error.name} ${error.code ?? error.http_code ?? ''}`.trim())
    if (pagesStarted) await removePageImages(folder)
    await progress.flush()
    try {
      await updateAttempt(flipbook, {
        status: 'failed',
        pageCount: null,
        pages: [],
        'conversion.completedAt': new Date(),
        'conversion.error': userMessageFor(error, timedOut),
      })
    } catch (saveError) {
      console.error(`Could not record failed conversion for flipbook ${flipbook._id}: ${saveError.name}`)
    }
  } finally {
    clearTimeout(deadline)
    await renderer?.close()
  }
}

function startQueuedConversions() {
  while (activeConversions < MAX_ACTIVE_CONVERSIONS && queue.length > 0) {
    const job = queue.shift()
    activeConversions++
    job().finally(() => {
      activeConversions--
      startQueuedConversions()
    })
  }
}

export function conversionQueueIsFull() {
  return queue.length >= MAX_QUEUED_CONVERSIONS
}

// pdf (the uploaded bytes) is kept only for a job that starts right away. A job that has to wait
// downloads the original when its turn comes, so waiting jobs never hold PDFs in memory.
export function queueConversion(flipbook, { pdf, ...options }) {
  const startsNow = activeConversions < MAX_ACTIVE_CONVERSIONS && queue.length === 0
  const jobOptions = startsNow && pdf ? { ...options, pdf } : options
  queue.push(() => runConversion(flipbook, jobOptions))
  startQueuedConversions()
}

// The queue lives in memory, so a restart abandons running conversions. On startup they are
// marked failed (the user can retry) and their partial page images are removed.
// Assumes a single backend instance, like the in-memory rate limiters.
export async function recoverInterruptedConversions() {
  try {
    const interrupted = await Flipbook.find({ status: 'processing' }).select('ownerId status conversion')
    for (const flipbook of interrupted) {
      await updateAttempt(flipbook, {
        status: 'failed',
        'conversion.completedAt': new Date(),
        'conversion.error': CONVERSION_MESSAGES.interrupted,
      })
      if (getCloudinary()) {
        await removePageImages(pageFolder(flipbook.ownerId, flipbook._id, flipbook.conversion.attemptId))
      }
    }
    if (interrupted.length > 0) console.log(`Marked ${interrupted.length} interrupted conversion(s) as failed`)
  } catch (error) {
    console.error(`Interrupted conversion recovery failed: ${error.name}`)
  }
}
