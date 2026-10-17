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

// Per-user limit for starting PDF conversions. Mounted after requireAuth, so req.user is always set.
export const conversionRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Conversion limit reached. Please try again later.' })
  },
})

// Per-user limit for deleting flipbooks. Mounted after requireAuth, so req.user is always set.
export const deleteRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Delete limit reached. Please try again later.' })
  },
})

// Per-user limit for flipbook settings such as the viewing style. Mounted after requireAuth.
export const settingsRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many changes. Please try again later.' })
  },
})

// Per-user limit for publishing and unpublishing. Mounted after requireAuth.
export const publishRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many publish changes. Please try again later.' })
  },
})

// Per-IP limits for the public viewer (no sign-in). A full read of a 200-page flipbook is about
// 200 image requests, so the image limit allows several readers behind one shared network.
export const publicFlipbookRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests. Please try again in a few minutes.' })
  },
})

// Original PDF downloads are large (up to 50 MB through the server), so they are limited harder.
export const publicDownloadRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many downloads. Please try again in a few minutes.' })
  },
})

export const publicPageImageRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 3000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests. Please try again in a few minutes.' })
  },
})

// Per-user limit for page images in the private viewer. Each page is one request, so this allows
// several full readings of a 200-page flipbook per window. Mounted after requireAuth.
export const pageImageRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 1500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many page requests. Please try again in a few minutes.' })
  },
})

// Activity reports from the public viewer (Milestone 10): one when a flipbook opens, then at most
// one every few seconds while pages are turned, and one when the reader leaves. 600 per address per
// 15 minutes leaves room for several readers behind one shared network. Over the limit the viewer
// simply stops reporting; reading is not affected.
export const publicActivityRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests. Please try again in a few minutes.' })
  },
})

// The owner's analytics reports, per user.
export const analyticsRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests. Please try again in a few minutes.' })
  },
})
