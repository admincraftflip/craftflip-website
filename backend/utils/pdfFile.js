import path from 'node:path'

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024

const MAX_FILENAME_LENGTH = 200

// Every PDF starts with a header such as "%PDF-1.7" or "%PDF-2.0". The filename and the
// MIME type the client declares are not trusted; only the file's own bytes are.
export function hasPdfSignature(buffer) {
  return /^%PDF-[12]\.\d/.test(buffer.subarray(0, 8).toString('latin1'))
}

export function cleanFilename(originalName) {
  const baseName = path.basename(originalName ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return baseName.slice(0, MAX_FILENAME_LENGTH) || 'document.pdf'
}
