import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  conversionRateLimiter,
  deleteRateLimiter,
  pageImageRateLimiter,
  publishRateLimiter,
  searchRateLimiter,
  settingsRateLimiter,
  uploadRateLimiter,
} from '../middleware/rateLimiter.js'
import { receiveBackground, receiveLogo, receivePdf, requirePdfStorage } from '../middleware/pdfUpload.js'
import {
  downloadOwnOriginal,
  getOwnBackground,
  getOwnLogo,
  removeBackground,
  removeLogo,
  uploadBackground,
  uploadLogo,
} from '../controllers/readerAssetsController.js'
import {
  deleteFlipbook,
  getFlipbook,
  getFlipbookPages,
  getPageImage,
  listFlipbooks,
  publishOwnFlipbook,
  searchOwnFlipbook,
  startConversion,
  unpublishOwnFlipbook,
  updateFlipbookSettings,
  uploadFlipbook,
} from '../controllers/flipbookController.js'

const router = Router()

router.use(requireAuth)

router.get('/', listFlipbooks)
router.post('/', uploadRateLimiter, requirePdfStorage, receivePdf, uploadFlipbook)
router.get('/:id', getFlipbook)
router.patch('/:id', settingsRateLimiter, updateFlipbookSettings)
router.post('/:id/logo', settingsRateLimiter, requirePdfStorage, receiveLogo, uploadLogo)
router.delete('/:id/logo', settingsRateLimiter, removeLogo)
router.get('/:id/logo', getOwnLogo)
router.post('/:id/background', settingsRateLimiter, requirePdfStorage, receiveBackground, uploadBackground)
router.delete('/:id/background', settingsRateLimiter, removeBackground)
router.get('/:id/background', getOwnBackground)
router.get('/:id/original', pageImageRateLimiter, downloadOwnOriginal)
router.delete('/:id', deleteRateLimiter, deleteFlipbook)
router.post('/:id/convert', conversionRateLimiter, requirePdfStorage, startConversion)
router.post('/:id/publish', publishRateLimiter, publishOwnFlipbook)
router.post('/:id/unpublish', publishRateLimiter, unpublishOwnFlipbook)
router.get('/:id/pages', getFlipbookPages)
router.get('/:id/pages/:pageNumber/image', pageImageRateLimiter, getPageImage)
router.get('/:id/search', searchRateLimiter, searchOwnFlipbook)

export default router
