import { rateLimit } from 'express-rate-limit'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

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
