import mongoose from 'mongoose'
import Flipbook, { MAX_TITLE_LENGTH } from '../models/Flipbook.js'
import { generateSlug } from '../utils/slug.js'
import { MAX_PDF_SIZE_BYTES, cleanFilename, hasPdfSignature } from '../utils/pdfFile.js'
import { deletePdf, pdfPublicId, uploadPdf } from '../utils/pdfStorage.js'

const DUPLICATE_KEY_ERROR = 11000
const MAX_SLUG_ATTEMPTS = 5
const LIST_LIMIT = 100

function titleFromFilename(filename) {
  const title = filename.replace(/\.pdf$/i, '').replace(/[_\s]+/g, ' ').trim()
  return title.slice(0, MAX_TITLE_LENGTH).trim() || 'Untitled flipbook'
}

// A random suffix makes slug collisions rare; on the rare collision, retry with a new suffix.
async function createWithUniqueSlug(fields) {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await Flipbook.create({ ...fields, slug: generateSlug(fields.title) })
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
    })
    res.status(201).json({ success: true, data: { flipbook: flipbook.toSummary() } })
  } catch (error) {
    console.error(`Flipbook save failed after upload: ${error.name}`)
    await removeUploadedPdf(publicId)
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
  }
}

export async function listFlipbooks(req, res) {
  const flipbooks = await Flipbook.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).limit(LIST_LIMIT)
  res.json({ success: true, data: { flipbooks: flipbooks.map((flipbook) => flipbook.toSummary()) } })
}

// Another user's flipbook gets the same 404 as a missing one, so IDs cannot be probed.
export async function getFlipbook(req, res) {
  const { id } = req.params
  const flipbook = mongoose.isValidObjectId(id) ? await Flipbook.findOne({ _id: id, ownerId: req.user._id }) : null
  if (!flipbook) {
    return res.status(404).json({ success: false, message: 'Flipbook not found.' })
  }
  res.json({ success: true, data: { flipbook: flipbook.toSummary() } })
}
