import { getCloudinary } from '../config/cloudinary.js'

// Original PDFs are private: raw files with authenticated delivery, so they are never
// reachable through a public Cloudinary URL.
const PDF_ASSET_OPTIONS = { resource_type: 'raw', type: 'authenticated' }
const UPLOAD_TIMEOUT_MS = 120 * 1000

export function pdfPublicId(userId, flipbookId) {
  return `craftflip/users/${userId}/flipbooks/${flipbookId}/original.pdf`
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
