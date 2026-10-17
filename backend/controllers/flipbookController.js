import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import Flipbook, { MAX_TITLE_LENGTH } from '../models/Flipbook.js'
import ViewSession from '../models/ViewSession.js'
import { generateSlug, normalizeSlugInput } from '../utils/slug.js'
import { MAX_PDF_SIZE_BYTES, cleanFilename, hasPdfSignature } from '../utils/pdfFile.js'
import { deleteFlipbookAssets, deletePdf, fetchPageImage, pdfPublicId, uploadPdf } from '../utils/pdfStorage.js'
import { getCloudinary } from '../config/cloudinary.js'
import { VIEWER_STYLES, isViewerStyle } from '../utils/viewerStyles.js'
import { parseReaderUpdate } from '../utils/readerSettings.js'
import { conversionQueueIsFull, queueConversion } from '../utils/pdfConversion.js'
import { maxPagesForPlan, maxPublishedForPlan } from '../utils/planLimits.js'
import { PublishError, changeSlug, isSlugRetired, publishFlipbook, publishedCountFor, unpublishFlipbook } from '../utils/publishing.js'
import { pageImageContentType, pageImageVariant } from '../utils/pageImageVariant.js'

const DUPLICATE_KEY_ERROR = 11000
const MAX_SLUG_ATTEMPTS = 5
const LIST_LIMIT = 100

function titleFromFilename(filename) {
  const title = filename.replace(/\.pdf$/i, '').replace(/[_\s]+/g, ' ').trim()
  return title.slice(0, MAX_TITLE_LENGTH).trim() || 'Untitled flipbook'
}

// A random suffix makes slug collisions rare; on the rare collision, retry with a new suffix.
// Slugs that were ever published stay retired, even after their flipbook is deleted.
async function createWithUniqueSlug(fields) {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = generateSlug(fields.title)
    if (attempt < MAX_SLUG_ATTEMPTS && (await isSlugRetired(slug))) continue
    try {
      return await Flipbook.create({ ...fields, slug })
    } catch (error) {
      const isSlugCollision = error.code === DUPLICATE_KEY_ERROR && error.keyPattern?.slug
      if (!isSlugCollision || attempt === MAX_SLUG_ATTEMPTS) throw error
    }
  }
}

// The Cloudinary plan caps each file (10 MB on the Free plan), below our own 50 MB limit.
// Retrying cannot help, so this is reported as a 413 instead of a generic storage failure.
function isFileTooLargeForStorage(error) {
  return error.http_code === 400 && /file size too large/i.test(error.message ?? '')
}

async function removeUploadedPdf(publicId) {
  try {
    await deletePdf(publicId)
  } catch (error) {
    console.error(`Orphaned Cloudinary asset needs manual removal: ${publicId} (${error.name})`)
  }
}

export async function uploadFlipbook(req, res) {
  const file = req.file
  if (!file) {
    return res.status(400).json({ success: false, message: 'Choose a PDF file to upload.' })
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return res.status(413).json({ success: false, message: 'PDF files must be 50 MB or smaller.' })
  }
  if (!hasPdfSignature(file.buffer)) {
    return res.status(400).json({ success: false, message: 'Only PDF files can be uploaded.' })
  }

  const filename = cleanFilename(file.originalname)
  const flipbookId = new mongoose.Types.ObjectId()
  const publicId = pdfPublicId(req.user._id, flipbookId)

  let asset
  try {
    asset = await uploadPdf(file.buffer, publicId)
  } catch (error) {
    // Cloudinary error text can include account details, so only the status code is logged.
    console.error(`Cloudinary upload failed (http ${error.http_code ?? 'unknown'})`)
    if (isFileTooLargeForStorage(error)) {
      return res.status(413).json({ success: false, message: 'This PDF is too large to store. Please upload a smaller file.' })
    }
    return res.status(502).json({ success: false, message: "We couldn't store your PDF. Please try again." })
  }

  // Conversion starts with the upload when the queue has room: the record is created already
  // claimed (as POST /:id/convert would claim it), and the job gets the PDF bytes still in
  // memory, saving a second request and a download of the same file from Cloudinary.
  // With a full queue the flipbook stays "uploaded" and the dashboard's Convert/Retry applies.
  const startConversionNow = !conversionQueueIsFull()

  try {
    const flipbook = await createWithUniqueSlug({
      _id: flipbookId,
      ownerId: req.user._id,
      title: titleFromFilename(filename),
      originalFile: { filename, sizeBytes: file.size },
      pdfAsset: {
        publicId: asset.public_id,
        version: asset.version,
        resourceType: asset.resource_type,
        deliveryType: asset.type,
      },
      ...(startConversionNow ? { status: 'processing', conversion: newConversionAttempt() } : {}),
    })
    if (startConversionNow) queueConversion(flipbook, { maxPages: maxPagesForPlan(req.user.plan), pdf: file.buffer })
    res.status(201).json({ success: true, data: { flipbook: flipbook.toSummary() } })
  } catch (error) {
    console.error(`Flipbook save failed after upload: ${error.name}`)
    await removeUploadedPdf(publicId)
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
  }
}

export async function listFlipbooks(req, res) {
  const flipbooks = await Flipbook.find({ ownerId: req.user._id }).select('-pages').sort({ createdAt: -1 }).limit(LIST_LIMIT)
  const limit = maxPublishedForPlan(req.user.plan)
  const publishing = { published: await publishedCountFor(req.user._id), limit: Number.isFinite(limit) ? limit : null }
  res.json({ success: true, data: { flipbooks: flipbooks.map((flipbook) => flipbook.toSummary()), publishing } })
}

// Another user's flipbook gets the same 404 as a missing one, so IDs cannot be probed.
export async function getFlipbook(req, res) {
  const { id } = req.params
  const flipbook = mongoose.isValidObjectId(id) ? await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select('-pages') : null
  if (!flipbook) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
}

const CONVERTIBLE_STATUSES = ['uploaded', 'failed']

// A fresh attempt: a new ID (so a stale attempt can never write) and progress from zero.
function newConversionAttempt() {
  return { attemptId: randomUUID(), startedAt: new Date(), completedAt: null, error: null, stage: 'queued', totalPages: null, completedPages: 0 }
}
const CONVERSION_CONFLICT_MESSAGES = {
  processing: 'This PDF is already being converted.',
  deleting: 'This flipbook is being deleted.',
}

// Claims the flipbook atomically (uploaded/failed -> processing), so concurrent or repeated
// requests cannot start a second conversion. The work runs in the background; poll GET /:id.
export async function startConversion(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  if (conversionQueueIsFull()) {
    return res.status(503).json({ success: false, message: 'Conversion is busy right now. Please try again in a few minutes.' })
  }

  const flipbook = await Flipbook.findOneAndUpdate(
    { _id: id, ownerId: req.user._id, status: { $in: CONVERTIBLE_STATUSES } },
    {
      $set: {
        status: 'processing',
        conversion: newConversionAttempt(),
      },
    },
    { returnDocument: 'after', projection: { pages: 0 } }
  )

  if (!flipbook) {
    const existing = await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select('status')
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Flipbook not found.' })
    }
    const message = CONVERSION_CONFLICT_MESSAGES[existing.status] ?? 'This PDF has already been converted.'
    return res.status(409).json({ success: false, message })
  }

  queueConversion(flipbook, { maxPages: maxPagesForPlan(req.user.plan) })
  res.status(202).json({ success: true, data: { flipbook: flipbook.toSummary() } })
}

// Page layout for the private viewer: number and size only, in reading order. Cloudinary details
// stay on the server; each image is fetched through GET /:id/pages/:pageNumber/image.
export async function getFlipbookPages(req, res) {
  const { id } = req.params
  const flipbook = mongoose.isValidObjectId(id) ? await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select('-pdfAsset') : null
  if (!flipbook) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  const pages = flipbook.status === 'ready' ? flipbook.pages.map(({ pageNumber, width, height }) => ({ pageNumber, width, height })) : []
  pages.sort((first, second) => first.pageNumber - second.pageNumber)
  res.json({ success: true, data: { flipbook: flipbook.toSummary(), pages } })
}

// Sends one page image to its owner. Page images are private (authenticated delivery), so the
// browser never receives a Cloudinary URL. Missing, foreign and unconverted flipbooks get the same 404.
export async function getPageImage(req, res) {
  const { id } = req.params
  const pageNumber = Number(req.params.pageNumber)
  // ?size=thumb: the small preview for the reader's thumbnail panel.
  const variant = pageImageVariant(req.query)
  if (!mongoose.isValidObjectId(id) || !Number.isInteger(pageNumber) || pageNumber < 1 || !variant) {
    return res.status(404).json({ success: false, message: 'Page not found.' })
  }
  if (!getCloudinary()) {
    return res.status(503).json({ success: false, message: 'Page images are temporarily unavailable. Please try again later.' })
  }

  const flipbook = await Flipbook.findOne({ _id: id, ownerId: req.user._id, status: 'ready' }).select({
    pages: { $elemMatch: { pageNumber } },
  })
  const page = flipbook?.pages?.[0]
  if (!page) {
    return res.status(404).json({ success: false, message: 'Page not found.' })
  }

  try {
    const image = await fetchPageImage(page, variant)
    res.set({
      'Content-Type': pageImageContentType(variant, page.format),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    res.send(image)
  } catch (error) {
    // The error message carries only the HTTP status, never the signed URL.
    console.error(error.message)
    res.status(502).json({ success: false, message: "We couldn't load this page. Please try again." })
  }
}

// A flipbook being converted cannot be deleted: the conversion may still upload page images.
// "deleting" is included so a deletion whose file cleanup failed can be retried.
const DELETABLE_STATUSES = ['uploaded', 'ready', 'failed', 'deleting']

// Deletes the user's own flipbook and everything it stored. The record is first marked
// "deleting" (atomically, filtered by owner), so no conversion can start on it, then its
// Cloudinary files are deleted, and only then the record. If file cleanup fails, the record
// stays as "deleting" and the user is told to retry; nothing is reported as deleted.
export async function deleteFlipbook(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  if (!getCloudinary()) {
    return res.status(503).json({ success: false, message: 'Deleting is temporarily unavailable. Please try again later.' })
  }

  const flipbook = await Flipbook.findOneAndUpdate(
    { _id: id, ownerId: req.user._id, status: { $in: DELETABLE_STATUSES } },
    // Unpublished in the same update, so public access stops before any file is touched.
    { $set: { status: 'deleting', isPublished: false } },
    { returnDocument: 'after', projection: { ownerId: 1, status: 1, pdfAsset: 1 } }
  )

  if (!flipbook) {
    const existing = await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select('status')
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Flipbook not found.' })
    }
    return res.status(409).json({ success: false, message: 'This PDF is still being converted. You can delete it once the conversion finishes.' })
  }

  try {
    await deleteFlipbookAssets(flipbook)
  } catch (error) {
    // Cloudinary error text can include account details, so only the type and status code are logged.
    console.error(`Flipbook ${flipbook._id} delete: file cleanup failed (${error.name} ${error.http_code ?? ''})`.trim())
    return res.status(502).json({
      success: false,
      message: "We couldn't delete all of this flipbook's files. It has been kept so you can try deleting it again.",
    })
  }

  await Flipbook.deleteOne({ _id: flipbook._id, ownerId: req.user._id, status: 'deleting' })
  // Its analytics go with it (Milestone 10). Public reports already stopped when it was unpublished
  // above; a failure here only leaves counts that no report shows per flipbook.
  try {
    await ViewSession.deleteMany({ flipbookId: flipbook._id, ownerId: req.user._id })
  } catch (error) {
    console.error(`Flipbook ${flipbook._id} delete: analytics cleanup failed (${error.name})`)
  }
  res.json({ success: true, data: { id: flipbook._id } })
}

function sendPublishError(res, error) {
  if (error instanceof PublishError) {
    return res.status(error.status).json({ success: false, message: error.message, ...error.details })
  }
  throw error
}

// Owner only: publishFlipbook filters by ownerId, so another user's flipbook is "not found".
export async function publishOwnFlipbook(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  try {
    const flipbook = await publishFlipbook(req.user, id)
    res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
  } catch (error) {
    sendPublishError(res, error)
  }
}

export async function unpublishOwnFlipbook(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  try {
    const flipbook = await unpublishFlipbook(req.user, id)
    res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
  } catch (error) {
    sendPublishError(res, error)
  }
}

// Owner-editable details (Milestone 8). Exactly these fields are accepted; anything else (owner,
// publication, status, files, plan) is refused with 400 rather than ignored. Every value is
// validated before anything is written, and the slug, which can be refused for reasons only the
// database knows, is written first, so a refused request changes nothing.
const EDITABLE_FIELDS = ['title', 'slug', 'confirmSlugChange', 'viewerStyle', 'reader']
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g

function normalizeTitle(value) {
  if (typeof value !== 'string') return null
  const title = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim()
  return title.length >= 1 && title.length <= MAX_TITLE_LENGTH ? title : null
}

function readDetails(body) {
  const fields = Object.keys(body)
  if (fields.length === 0 || fields.some((field) => !EDITABLE_FIELDS.includes(field))) {
    return { error: 'Only the title, link, viewing style and reader settings can be changed.' }
  }
  if (!['title', 'slug', 'viewerStyle', 'reader'].some((field) => field in body)) return { error: 'Nothing to change.' }

  const changes = {}
  if ('title' in body) {
    changes.title = normalizeTitle(body.title)
    if (!changes.title) return { error: `Titles must be 1 to ${MAX_TITLE_LENGTH} characters.` }
  }
  if ('viewerStyle' in body) {
    if (!isViewerStyle(body.viewerStyle)) return { error: `Choose one of the viewing styles: ${VIEWER_STYLES.join(', ')}.` }
    changes.viewerStyle = body.viewerStyle
  }
  if ('slug' in body) {
    changes.slug = normalizeSlugInput(body.slug)
    if (!changes.slug) return { error: 'Links use 3 to 80 lowercase letters, numbers and single hyphens, like spring-catalog-2026.' }
  }
  if ('reader' in body) {
    const reader = parseReaderUpdate(body.reader)
    if (reader.error) return { error: reader.error }
    Object.assign(changes, reader.set)
  }
  if ('confirmSlugChange' in body && typeof body.confirmSlugChange !== 'boolean') return { error: 'confirmSlugChange must be true or false.' }
  return { changes, confirmSlugChange: body.confirmSlugChange === true }
}

export async function updateFlipbookSettings(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const { error, changes, confirmSlugChange } = readDetails(body)
  if (error) return res.status(400).json({ success: false, message: error })

  let flipbook = null
  try {
    if (changes.slug) flipbook = await changeSlug(req.user, id, changes.slug, { confirmed: confirmSlugChange })
  } catch (slugError) {
    return sendPublishError(res, slugError)
  }

  const fieldUpdates = Object.fromEntries(Object.entries(changes).filter(([field]) => field !== 'slug'))
  if (Object.keys(fieldUpdates).length > 0) {
    // A flipbook being deleted is left alone. Publication, slug and pages are not touched here.
    flipbook = await Flipbook.findOneAndUpdate(
      { _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } },
      { $set: fieldUpdates },
      { returnDocument: 'after', projection: { pages: 0, pdfAsset: 0 } }
    )
    if (!flipbook) {
      const existing = await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select('status')
      if (!existing) return res.status(404).json({ success: false, message: 'Flipbook not found.' })
      return res.status(409).json({ success: false, message: 'This flipbook is being deleted.' })
    }
  }
  res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
}
