import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import Flipbook from '../models/Flipbook.js'
import { LogoError, MAX_BACKGROUND_BYTES, MAX_LOGO_BYTES, logoImageType, processBackground, processLogo } from '../utils/logoImage.js'
import { brandingFolder, deleteLogoImage, openOriginalPdfStream, openPageImageStream, uploadLogoImage } from '../utils/pdfStorage.js'

// Owner-only files of a flipbook's reader (Milestone 9): the logo, the background image, and the
// owner's own download of the original PDF. Every query is filtered by ownerId; another user's
// flipbook is "not found".

const NOT_FOUND = { success: false, message: 'Flipbook not found.' }
const OWNER_FIELDS = { pages: 0, pdfAsset: 0 }

// The two reader images share one flow; only these details differ. Both live in the flipbook's
// branding folder, so deleting the flipbook removes them (and any left over by a failed cleanup).
const READER_IMAGES = {
  logo: {
    path: 'reader.logo',
    filePrefix: 'logo',
    maxBytes: MAX_LOGO_BYTES,
    process: processLogo,
    // Uploading a logo changes nothing else.
    extraOnUpload: {},
    messages: {
      missing: 'Choose a logo image to upload.',
      tooLarge: 'Logos must be 2 MB or smaller.',
      wrongType: 'Logos must be PNG, JPEG or WebP images.',
      storeFailed: "We couldn't store your logo. Please try again.",
      loadFailed: "We couldn't load the logo. Please try again.",
      none: 'No logo.',
    },
  },
  background: {
    path: 'reader.background.image',
    filePrefix: 'background',
    maxBytes: MAX_BACKGROUND_BYTES,
    process: processBackground,
    // An uploaded background is shown straight away.
    extraOnUpload: { 'reader.background.kind': 'image' },
    messages: {
      missing: 'Choose a background image to upload.',
      tooLarge: 'Background images must be 8 MB or smaller.',
      wrongType: 'Background images must be PNG, JPEG or WebP images.',
      storeFailed: "We couldn't store your background image. Please try again.",
      loadFailed: "We couldn't load the background image. Please try again.",
      none: 'No background image.',
    },
  },
}

function storedImageAt(flipbook, path) {
  return path.split('.').reduce((value, key) => value?.[key], flipbook)
}

async function notFoundOrDeleting(res, id, ownerId) {
  const existing = await Flipbook.findOne({ _id: id, ownerId }).select('status')
  if (!existing) return res.status(404).json(NOT_FOUND)
  return res.status(409).json({ success: false, message: 'This flipbook is being deleted.' })
}

async function removeImageQuietly(publicId) {
  try {
    await deleteLogoImage(publicId)
  } catch (error) {
    // Left in the flipbook's branding folder, which is removed when the flipbook is deleted.
    console.error(`Reader image cleanup failed (${error.name}); it is removed with the flipbook`)
  }
}

async function ownerSummary(res, id, ownerId) {
  const flipbook = await Flipbook.findOne({ _id: id, ownerId }).select(OWNER_FIELDS)
  res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
}

function uploadReaderImage(spec) {
  return async function upload(req, res) {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(404).json(NOT_FOUND)
    const file = req.file
    if (!file) return res.status(400).json({ success: false, message: spec.messages.missing })
    if (file.size > spec.maxBytes) return res.status(413).json({ success: false, message: spec.messages.tooLarge })
    if (!logoImageType(file.buffer)) return res.status(400).json({ success: false, message: spec.messages.wrongType })

    let image
    try {
      image = await spec.process(file.buffer)
    } catch (error) {
      if (error instanceof LogoError) return res.status(400).json({ success: false, message: error.message })
      throw error
    }

    const owned = await Flipbook.findOne({ _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } }).select('_id')
    if (!owned) return notFoundOrDeleting(res, id, req.user._id)

    let asset
    try {
      asset = await uploadLogoImage(image.data, `${brandingFolder(req.user._id, id)}/${spec.filePrefix}-${randomUUID()}`)
    } catch (error) {
      console.error(`Reader image upload failed (http ${error.http_code ?? 'unknown'})`)
      return res.status(502).json({ success: false, message: spec.messages.storeFailed })
    }

    const stored = { publicId: asset.public_id, version: asset.version, format: asset.format, width: image.width, height: image.height }
    if (image.tone) stored.tone = image.tone
    stored.uploadedAt = new Date()
    // Returns the flipbook before the update, to remove the file it replaces.
    const previous = await Flipbook.findOneAndUpdate(
      { _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } },
      { $set: { [spec.path]: stored, ...spec.extraOnUpload } },
      { projection: { [spec.path]: 1 } }
    )
    if (!previous) {
      // Deleted or deletion started meanwhile: do not leave the new file behind.
      await removeImageQuietly(stored.publicId)
      return notFoundOrDeleting(res, id, req.user._id)
    }
    const replaced = storedImageAt(previous, spec.path)
    if (replaced?.publicId) await removeImageQuietly(replaced.publicId)
    await ownerSummary(res, id, req.user._id)
  }
}

function removeReaderImage(spec) {
  return async function remove(req, res) {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(404).json(NOT_FOUND)
    const previous = await Flipbook.findOneAndUpdate(
      { _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } },
      { $set: { [spec.path]: null } },
      { projection: { [spec.path]: 1 } }
    )
    if (!previous) return notFoundOrDeleting(res, id, req.user._id)
    const removed = storedImageAt(previous, spec.path)
    if (removed?.publicId) await removeImageQuietly(removed.publicId)
    await ownerSummary(res, id, req.user._id)
  }
}

export const uploadLogo = uploadReaderImage(READER_IMAGES.logo)
export const removeLogo = removeReaderImage(READER_IMAGES.logo)
export const uploadBackground = uploadReaderImage(READER_IMAGES.background)
// A background kind of "image" without an image reads as the default (utils/readerSettings.js),
// so removing the image never leaves the reader without a background.
export const removeBackground = removeReaderImage(READER_IMAGES.background)

async function sendStream(res, opened, headers) {
  res.set(headers)
  if (opened.contentLength) res.set('Content-Length', String(opened.contentLength))
  try {
    await pipeline(Readable.fromWeb(opened.stream), res)
  } catch (error) {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(`Stream failed: ${error.name}`)
  }
}

// The owner's preview shows the reader images through these authenticated routes.
function getOwnReaderImage(spec) {
  return async function getOwn(req, res) {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(404).json(NOT_FOUND)
    const flipbook = await Flipbook.findOne({ _id: id, ownerId: req.user._id }).select(spec.path)
    const image = storedImageAt(flipbook, spec.path)
    if (!image?.publicId) return res.status(404).json({ success: false, message: spec.messages.none })
    let opened
    try {
      opened = await openPageImageStream(image)
    } catch (error) {
      console.error(`Reader image delivery failed: ${error.message}`)
      return res.status(502).json({ success: false, message: spec.messages.loadFailed })
    }
    await sendStream(res, opened, { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' })
  }
}

export const getOwnLogo = getOwnReaderImage(READER_IMAGES.logo)
export const getOwnBackground = getOwnReaderImage(READER_IMAGES.background)

function attachmentHeader(filename) {
  const safe = filename.replace(/[^\w.\- ]+/g, '_')
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

// The owner can always download their own original, whatever the reader setting says.
export async function downloadOwnOriginal(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(404).json(NOT_FOUND)
  const flipbook = await Flipbook.findOne({ _id: id, ownerId: req.user._id, status: { $ne: 'deleting' } }).select('pdfAsset originalFile')
  if (!flipbook) return notFoundOrDeleting(res, id, req.user._id)
  let opened
  try {
    opened = await openOriginalPdfStream(flipbook.pdfAsset.publicId)
  } catch (error) {
    console.error(`Original download failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't download the PDF. Please try again." })
  }
  await sendStream(res, opened, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': attachmentHeader(flipbook.originalFile.filename),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
}

export { sendStream }
