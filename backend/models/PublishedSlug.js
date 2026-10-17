import mongoose from 'mongoose'

// Every slug that has been published, kept after its flipbook is deleted, so a shared link can
// never lead to a different flipbook. A reservation is written just before a flipbook's first
// publish; if that publish does not happen, the reservation is removed again.
const publishedSlugSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    flipbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flipbook', required: true },
  },
  { timestamps: true }
)

const PublishedSlug = mongoose.model('PublishedSlug', publishedSlugSchema)

export default PublishedSlug
