import mongoose from 'mongoose'

// One reading session of a published flipbook by one visitor (Milestone 10, PROJECT.md "Analytics
// data model"). Created by the first activity report from the public viewer and updated in place
// while the visitor keeps reading, so a session is one document, not one per page turn. A new
// session starts after VIEW_SESSION_GAP_MS without activity (utils/analytics.js).
//
// visitorId is a random first-party ID created in the visitor's browser (no cookie, never derived
// from the IP address or the device). It is used only to count unique visitors and is never sent
// to owners. No IP address, user agent string or full referrer URL is stored.
const viewSessionSchema = new mongoose.Schema(
  {
    flipbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flipbook', required: true },
    // Copied from the flipbook when the session starts, so account-wide reports need no join.
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visitorId: { type: String, required: true },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    // Pages shown on screen for at least a moment during the session, each once.
    pagesViewed: { type: [Number], default: [] },
    deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop'], required: true },
    // Host name of the page the visitor came from (no path or query), or null when unknown.
    referrerHost: { type: String, default: null, maxlength: 253 },
    // Read inside an embed (/embed/:slug) on another website.
    embedded: { type: Boolean, default: false },
    // Country is part of the confirmed data model but not collected yet: it needs an IP
    // geolocation source that is not in the approved stack (see PROJECT.md, Milestone 10).
    country: { type: String, default: null },
  },
  { timestamps: true }
)

// Dashboard queries: one owner's sessions in a date range, and one flipbook's.
viewSessionSchema.index({ ownerId: 1, startedAt: -1 })
viewSessionSchema.index({ flipbookId: 1, startedAt: -1 })
// Finding the visitor's open session when an activity report arrives.
viewSessionSchema.index({ flipbookId: 1, visitorId: 1, lastSeenAt: -1 })

const ViewSession = mongoose.model('ViewSession', viewSessionSchema)

export default ViewSession
