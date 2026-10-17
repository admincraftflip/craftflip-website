// Which version of a page image a request asks for: no "size" is the full page, "size=thumb" the
// small preview for the reader's thumbnail panel (utils/pdfStorage.js). Anything else returns null,
// which the routes answer like a missing page. Only these fixed values ever reach Cloudinary.
export function pageImageVariant(query) {
  const size = query?.size
  if (size === undefined) return 'full'
  return size === 'thumb' ? 'thumb' : null
}

// Previews are always WebP; full pages keep their stored format.
export function pageImageContentType(variant, format) {
  if (variant === 'thumb') return 'image/webp'
  return { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[format] ?? 'application/octet-stream'
}
