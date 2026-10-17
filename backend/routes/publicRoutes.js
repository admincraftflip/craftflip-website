import express, { Router } from 'express'
import { publicActivityRateLimiter, publicDownloadRateLimiter, publicFlipbookRateLimiter, publicPageImageRateLimiter } from '../middleware/rateLimiter.js'
import {
  downloadPublicPdf,
  getPublicBackground,
  getPublicFlipbook,
  getPublicLogo,
  getPublicPageImage,
  publicResponseHeaders,
  recordActivity,
} from '../controllers/publicFlipbookController.js'

// Public viewer API: no sign-in, per-IP limits, and only published flipbooks. Owner routes live
// in flipbookRoutes behind requireAuth; nothing here reads or trusts an Authorization header.
const router = Router()

router.use(publicResponseHeaders)

router.get('/flipbooks/:slug', publicFlipbookRateLimiter, getPublicFlipbook)
router.get('/flipbooks/:slug/pages/:pageNumber', publicPageImageRateLimiter, getPublicPageImage)
router.get('/flipbooks/:slug/logo', publicFlipbookRateLimiter, getPublicLogo)
router.get('/flipbooks/:slug/background', publicFlipbookRateLimiter, getPublicBackground)
router.get('/flipbooks/:slug/download', publicDownloadRateLimiter, downloadPublicPdf)
// Analytics (Milestone 10). The viewer sends text/plain JSON (no CORS preflight); 4 KB is far more
// than a report needs.
router.post('/flipbooks/:slug/activity', publicActivityRateLimiter, express.text({ type: 'text/plain', limit: '4kb' }), recordActivity)

export default router
