import mongoose from 'mongoose'
import { DEFAULT_VIEWER_STYLE, VIEWER_STYLES, resolveViewerStyle } from '../utils/viewerStyles.js'
import { BACKGROUND_KINDS, BACKGROUND_PRESETS, MAX_CTA_LABEL_LENGTH, ownerReaderView } from '../utils/readerSettings.js'

export const FLIPBOOK_STATUSES = ['uploaded', 'processing', 'ready', 'failed', 'deleting']
export const MAX_TITLE_LENGTH = 120

// One converted page: a private Cloudinary image. Pages are stored in reading order.
const pageSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    publicId: { type: String, required: true },
    version: { type: Number, required: true },
    format: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
  },
  { _id: false }
)

// The reader's logo: a private Cloudinary image under the flipbook's branding folder, re-encoded
// as WebP on upload. Never sent to the client as stored.
const logoSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    version: { type: Number, required: true },
    format: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
)

// The reader's uploaded background image: stored like the logo, plus whether it is light or dark.
const backgroundImageSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    version: { type: Number, required: true },
    format: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    tone: { type: String, enum: ['light', 'dark'], required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
)

// The social preview image (Milestone 13): a 1200x630 JPEG made from the first page, stored as a
// private Cloudinary image under the flipbook's social folder. Never sent to the client as stored.
const socialImageSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    version: { type: Number, required: true },
    format: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
)

const HEX_COLOR = /^#[0-9a-f]{6}$/

const flipbookSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: MAX_TITLE_LENGTH },
    slug: { type: String, required: true, unique: true },
    // uploaded: original PDF stored. processing: conversion running. ready: pages converted. failed: see conversion.error.
    // deleting: deletion started; the record stays until all its Cloudinary files are gone, so a failed deletion can be retried.
    status: { type: String, enum: FLIPBOOK_STATUSES, default: 'uploaded' },
    originalFile: {
      filename: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
    },
    // Private Cloudinary asset for the original PDF. Never sent to the client.
    pdfAsset: {
      publicId: { type: String, required: true },
      version: { type: Number, required: true },
      resourceType: { type: String, required: true },
      deliveryType: { type: String, required: true },
    },
    pageCount: { type: Number, default: null },
    // Page image details are private; never sent to the client as stored.
    pages: { type: [pageSchema], default: [] },
    // Publication is separate from status: a flipbook is public only while status is ready and
    // isPublished is true. The slug never changes once published (see PublishedSlug).
    isPublished: { type: Boolean, default: false },
    // Viewing style for the owner's preview and the public viewer (Milestone 7). Changing it never
    // changes the slug or publication. Older records without it read as the default.
    viewerStyle: { type: String, enum: VIEWER_STYLES, default: DEFAULT_VIEWER_STYLE },
    // Reader customisation (Milestone 9). The defaults keep the reader as it was before: CraftFlip
    // colours and background, no logo, no call to action, no PDF download. Validated in
    // utils/readerSettings.js. The Milestone 9 top-bar colour (accentColor) was replaced by the
    // background; values stored on older flipbooks are ignored.
    reader: {
      primaryColor: { type: String, default: null, match: HEX_COLOR },
      background: {
        kind: { type: String, enum: BACKGROUND_KINDS, default: 'default' },
        color: { type: String, default: null, match: HEX_COLOR },
        preset: { type: String, enum: [...Object.keys(BACKGROUND_PRESETS), null], default: null },
        image: { type: backgroundImageSchema, default: null },
      },
      logo: { type: logoSchema, default: null },
      cta: {
        enabled: { type: Boolean, default: false },
        label: { type: String, default: '', maxlength: MAX_CTA_LABEL_LENGTH },
        url: { type: String, default: '', maxlength: 2048 },
      },
      allowDownload: { type: Boolean, default: false },
    },
    // Made once per converted flipbook (utils/socialImage.js); null until then or when it could not
    // be made. socialImageGeneration claims the work (lease) and caps the attempts. Records from
    // before Milestone 13 have neither field and get an image the first time one is requested.
    socialImage: { type: socialImageSchema, default: null },
    socialImageGeneration: {
      attempts: { type: Number, default: 0 },
      leaseExpiresAt: { type: Date, default: null },
    },
    publishedAt: { type: Date, default: null },
    firstPublishedAt: { type: Date, default: null },
    unpublishedAt: { type: Date, default: null },
    conversion: {
      // Identifies the current attempt, so a stale attempt can never overwrite a newer one.
      attemptId: { type: String, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      // User-facing reason when status is failed.
      error: { type: String, default: null },
      // Progress of the current attempt while status is processing (see CONVERSION_STAGES in
      // utils/pdfConversion.js). A new attempt replaces the whole conversion object, so progress
      // from an earlier attempt is never shown.
      stage: { type: String, enum: ['queued', 'preparing', 'converting', 'finalizing', null], default: null },
      totalPages: { type: Number, default: null },
      completedPages: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

flipbookSchema.index({ createdAt: -1 })
flipbookSchema.index({ status: 1 })
// Counting a user's published flipbooks for the plan limit.
flipbookSchema.index({ ownerId: 1, isPublished: 1 })

// Owner-only progress. percent counts stored pages; it stays below 100 until the flipbook is
// ready, because saving the page list still follows the last page.
function conversionProgress(conversion) {
  const totalPages = conversion?.totalPages ?? null
  const completedPages = Math.min(conversion?.completedPages ?? 0, totalPages ?? 0)
  const percent = totalPages ? Math.min(99, Math.floor((completedPages / totalPages) * 100)) : 0
  return { stage: conversion?.stage ?? 'queued', completedPages, totalPages, percent }
}

flipbookSchema.methods.toSummary = function toSummary() {
  return {
    id: this._id,
    title: this.title,
    slug: this.slug,
    status: this.status,
    originalFilename: this.originalFile.filename,
    sizeBytes: this.originalFile.sizeBytes,
    // Only a finished conversion has a meaningful page count.
    pageCount: this.status === 'ready' ? (this.pageCount ?? null) : null,
    conversionError: this.status === 'failed' ? (this.conversion?.error ?? null) : null,
    conversionProgress: this.status === 'processing' ? conversionProgress(this.conversion) : null,
    isPublished: this.status === 'ready' && this.isPublished === true,
    // Whether the link has ever been public: changing the slug then breaks an old link (Slug rules).
    hasBeenPublished: Boolean(this.firstPublishedAt),
    viewerStyle: resolveViewerStyle(this.viewerStyle),
    reader: ownerReaderView(this.reader),
    publishedAt: this.status === 'ready' && this.isPublished ? this.publishedAt : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
}

const Flipbook = mongoose.model('Flipbook', flipbookSchema)

export default Flipbook
