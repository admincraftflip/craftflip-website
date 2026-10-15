import mongoose from 'mongoose'

export const FLIPBOOK_STATUSES = ['uploaded', 'processing', 'ready', 'failed']
export const MAX_TITLE_LENGTH = 120

const flipbookSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: MAX_TITLE_LENGTH },
    slug: { type: String, required: true, unique: true },
    // uploaded: original PDF stored. processing, ready and failed are set by page conversion (Milestone 4).
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
  },
  { timestamps: true }
)

flipbookSchema.index({ createdAt: -1 })

flipbookSchema.methods.toSummary = function toSummary() {
  return {
    id: this._id,
    title: this.title,
    slug: this.slug,
    status: this.status,
    originalFilename: this.originalFile.filename,
    sizeBytes: this.originalFile.sizeBytes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
}

const Flipbook = mongoose.model('Flipbook', flipbookSchema)

export default Flipbook
