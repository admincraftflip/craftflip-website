import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { uploadRateLimiter } from '../middleware/rateLimiter.js'
import { receivePdf, requirePdfStorage } from '../middleware/pdfUpload.js'
import { getFlipbook, listFlipbooks, uploadFlipbook } from '../controllers/flipbookController.js'

const router = Router()

router.use(requireAuth)

router.get('/', listFlipbooks)
router.post('/', uploadRateLimiter, requirePdfStorage, receivePdf, uploadFlipbook)
router.get('/:id', getFlipbook)

export default router
