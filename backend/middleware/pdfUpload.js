import multer from 'multer'
import { getCloudinary } from '../config/cloudinary.js'
import { MAX_PDF_SIZE_BYTES } from '../utils/pdfFile.js'

const MAX_TEXT_FIELD_BYTES = 1024

// Memory storage: the PDF is held in req.file.buffer and never written to the server's disk.
const parseSinglePdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 1, fields: 5, fieldSize: MAX_TEXT_FIELD_BYTES },
  // Browsers send UTF-8 filenames; Multer's default (latin1) would garble non-English names.
  defParamCharset: 'utf8',
}).single('pdf')

// Runs before the body is read, so an upload that cannot be stored is refused without buffering 50MB.
export function requirePdfStorage(req, res, next) {
  if (!getCloudinary()) {
    return res.status(503).json({ success: false, message: 'Uploads are temporarily unavailable. Please try again later.' })
  }
  next()
}

export function receivePdf(req, res, next) {
  parseSinglePdf(req, res, (error) => {
    if (!error) return next()

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'PDF files must be 50 MB or smaller.' })
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: 'Upload one PDF file at a time.' })
    }
    // Malformed or interrupted multipart bodies surface here as parser errors.
    res.status(400).json({ success: false, message: 'The upload could not be read. Please try again.' })
  })
}
