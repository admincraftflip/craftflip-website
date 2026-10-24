import { getCloudinary } from '../config/cloudinary.js'
import { MAX_PDF_SIZE_BYTES } from './pdfFile.js'

// Original PDFs are private: raw files with authenticated delivery, so they are never
// reachable through a public Cloudinary URL.
const PDF_ASSET_OPTIONS = { resource_type: 'raw', type: 'authenticated' }
const PAGE_ASSET_OPTIONS = { resource_type: 'image', type: 'authenticated' }
const UPLOAD_TIMEOUT_MS = 120 * 1000
const DOWNLOAD_TIMEOUT_MS = 120 * 1000

// Everything stored for one flipbook lives under this folder: the original PDF and every
// conversion attempt's page images. User and flipbook IDs are fixed-length ObjectIds.
export function flipbookFolder(userId, flipbookId) {
  return `craftflip/users/${userId}/flipbooks/${flipbookId}`
}

export function pdfPublicId(userId, flipbookId) {
  return `${flipbookFolder(userId, flipbookId)}/original.pdf`
}

export function uploadPdf(buffer, publicId) {
  const cloudinary = getCloudinary()
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { ...PDF_ASSET_OPTIONS, public_id: publicId, overwrite: false, timeout: UPLOAD_TIMEOUT_MS },
      (error, result) => (error ? reject(error) : resolve(result))
    )
    uploadStream.end(buffer)
  })
}

export async function deletePdf(publicId) {
  const cloudinary = getCloudinary()
  const { result } = await cloudinary.uploader.destroy(publicId, { ...PDF_ASSET_OPTIONS, invalidate: true })
  if (result !== 'ok' && result !== 'not found') {
    throw new Error(`Cloudinary destroy returned "${result}"`)
  }
}

// Reads the private original through Cloudinary's authenticated API download. CDN delivery of
// PDFs is blocked on the account, and the signed URL is never logged or sent to the client.
export async function downloadPdf(publicId) {
  const cloudinary = getCloudinary()
  const url = cloudinary.utils.private_download_url(publicId, '', PDF_ASSET_OPTIONS)
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`Cloudinary download failed (http ${response.status})`)
  }
  if (Number(response.headers.get('content-length')) > MAX_PDF_SIZE_BYTES) {
    throw new Error('Stored PDF exceeds the size limit')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error('Stored PDF exceeds the size limit')
  }
  return buffer
}

// Page images stay private (authenticated delivery) until publishing exists. Each conversion
// attempt gets its own folder, so a failed attempt can be removed without touching other files.
export function pageFolder(userId, flipbookId, attemptId) {
  return `craftflip/users/${userId}/flipbooks/${flipbookId}/pages/${attemptId}`
}

export function pagePublicId(folder, pageNumber) {
  return `${folder}/page-${String(pageNumber).padStart(3, '0')}`
}

export function uploadPageImage(buffer, publicId) {
  const cloudinary = getCloudinary()
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { ...PAGE_ASSET_OPTIONS, public_id: publicId, overwrite: false, timeout: UPLOAD_TIMEOUT_MS },
      (error, result) => (error ? reject(error) : resolve(result))
    )
    uploadStream.end(buffer)
  })
}

// Cloudinary reports each image as "deleted" or "not_found"; anything else means it is still stored.
const DELETED_RESULTS = ['deleted', 'not_found']
// Cloudinary deletes up to 1000 images per call; 50 calls is far beyond any flipbook's page count.
const MAX_DELETE_BATCHES = 50

export async function deletePageImages(folder) {
  const cloudinary = getCloudinary()
  for (let batch = 1; batch <= MAX_DELETE_BATCHES; batch++) {
    const response = await cloudinary.api.delete_resources_by_prefix(`${folder}/`, { ...PAGE_ASSET_OPTIONS, invalidate: true })
    const notDeleted = Object.values(response.deleted ?? {}).filter((result) => !DELETED_RESULTS.includes(result))
    if (notDeleted.length > 0) {
      throw new Error(`Cloudinary could not delete ${notDeleted.length} page image(s)`)
    }
    if (!response.partial) return
  }
  throw new Error('Cloudinary page image deletion did not finish')
}

// Deletes everything a flipbook stored: the original PDF and the page images of every
// conversion attempt. Safe to repeat: files already gone count as deleted. Throws if anything
// could not be deleted, so the caller keeps the flipbook record and the user can retry.
export async function deleteFlipbookAssets(flipbook) {
  const folder = flipbookFolder(flipbook.ownerId, flipbook._id)
  // Never delete a file outside this flipbook's own folder, whatever the record says.
  if (flipbook.pdfAsset?.publicId !== pdfPublicId(flipbook.ownerId, flipbook._id)) {
    throw new Error('Stored PDF is outside the flipbook folder')
  }
  await deletePdf(flipbook.pdfAsset.publicId)
  await deletePageImages(`${folder}/pages`)
  // Logos and background images (Milestone 9), current and any left over from an interrupted replacement.
  await deletePageImages(brandingFolder(flipbook.ownerId, flipbook._id))
  // The social preview image (Milestone 13), and any left over from an interrupted generation.
  await deletePageImages(socialFolder(flipbook.ownerId, flipbook._id))
}

// The social preview image (Milestone 13): a private JPEG like the page images, served to link
// preview crawlers only through the public API while the flipbook is published. A new file name
// per generation, so an upload never overwrites a stored image.
export function socialFolder(userId, flipbookId) {
  return `${flipbookFolder(userId, flipbookId)}/social`
}

export function uploadSocialImage(buffer, publicId) {
  return uploadPageImage(buffer, publicId)
}

export function deleteSocialImage(publicId) {
  return deleteLogoImage(publicId)
}

const PAGE_FETCH_TIMEOUT_MS = 30 * 1000

// Page previews for the reader's thumbnail panel: a WebP at most 240px wide, made by Cloudinary
// from the stored page on first request (nothing extra is stored by us). The transformation is
// part of the signed URL, so it cannot be changed by anyone else. Requests choose it through
// utils/pageImageVariant.js.
const THUMBNAIL_OPTIONS = { format: 'webp', transformation: [{ width: 240, crop: 'limit', quality: 'auto' }] }

// Reads one private page image through a signed delivery URL built on the server. The URL and
// public ID are never logged or sent to the client; the viewer receives only the image bytes.
function signedPageImageUrl(page, variant = 'full') {
  return getCloudinary().url(page.publicId, {
    ...PAGE_ASSET_OPTIONS,
    version: page.version,
    format: page.format,
    ...(variant === 'thumb' ? THUMBNAIL_OPTIONS : {}),
    sign_url: true,
    secure: true,
  })
}

export async function fetchPageImage(page, variant = 'full') {
  const response = await fetch(signedPageImageUrl(page, variant), { signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`Cloudinary page delivery failed (http ${response.status})`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// Pages are rendered at most 4000px on a side as WebP; anything far larger is not one of ours.
const MAX_PAGE_IMAGE_BYTES = 20 * 1024 * 1024

// Opens one private page image for streaming to a public visitor. The page comes from a
// verified database record, never from the request, and the signed URL never leaves the server.
// Returns a web ReadableStream and its length; at most one page is ever held. variant "thumb"
// streams the small preview instead (page images only; logos and backgrounds use "full").
export async function openPageImageStream(page, variant = 'full') {
  const response = await fetch(signedPageImageUrl(page, variant), { signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS) })
  if (!response.ok || !response.body) {
    throw new Error(`Cloudinary page delivery failed (http ${response.status})`)
  }
  const contentLength = Number(response.headers.get('content-length')) || null
  if (contentLength > MAX_PAGE_IMAGE_BYTES) {
    await response.body.cancel()
    throw new Error('Page image exceeds the size limit')
  }
  return { stream: response.body, contentLength }
}

// Reader images (Milestone 9: the logo and the background image) live with the flipbook, so
// deleting the flipbook removes them too. uploadLogoImage and deleteLogoImage serve both.
export function brandingFolder(userId, flipbookId) {
  return `${flipbookFolder(userId, flipbookId)}/branding`
}

export function uploadLogoImage(buffer, publicId) {
  return uploadPageImage(buffer, publicId)
}

export async function deleteLogoImage(publicId) {
  const cloudinary = getCloudinary()
  const { result } = await cloudinary.uploader.destroy(publicId, { ...PAGE_ASSET_OPTIONS, invalidate: true })
  if (result !== 'ok' && result !== 'not found') {
    throw new Error(`Cloudinary destroy returned "${result}"`)
  }
}

// Streams the private original PDF through Cloudinary's authenticated API download, for the
// owner's own download and for a published flipbook whose owner allows downloads. The signed
// address never leaves the server; at most one PDF of up to 50 MB passes through at a time per request.
export async function openOriginalPdfStream(publicId) {
  const cloudinary = getCloudinary()
  const url = cloudinary.utils.private_download_url(publicId, '', PDF_ASSET_OPTIONS)
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok || !response.body) {
    throw new Error(`Cloudinary download failed (http ${response.status})`)
  }
  const contentLength = Number(response.headers.get('content-length')) || null
  if (contentLength > MAX_PDF_SIZE_BYTES) {
    await response.body.cancel()
    throw new Error('Stored PDF exceeds the size limit')
  }
  return { stream: response.body, contentLength }
}
