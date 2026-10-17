import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { analyticsRateLimiter } from '../middleware/rateLimiter.js'
import { getAccountAnalytics, getFlipbookAnalytics } from '../controllers/analyticsController.js'

// The owner's analytics (Milestone 10). Public viewers report activity through /api/public.
const router = Router()

router.use(requireAuth)

router.get('/', analyticsRateLimiter, getAccountAnalytics)
router.get('/flipbooks/:id', analyticsRateLimiter, getFlipbookAnalytics)

export default router
