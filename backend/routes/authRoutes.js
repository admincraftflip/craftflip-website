import { Router } from 'express'
import { authRateLimiter } from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getCurrentUser } from '../controllers/authController.js'

const router = Router()

router.use(authRateLimiter)

router.get('/me', requireAuth, getCurrentUser)

export default router
