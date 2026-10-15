import { rateLimit } from 'express-rate-limit'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000

// Per-IP limit for /api/auth/*. In-memory store: fine while the backend runs as a single instance.
export const authRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' })
  },
})

// Per-user limit for PDF uploads. Mounted after requireAuth, so req.user is always set.
export const uploadRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Upload limit reached. Please try again later.' })
  },
})
