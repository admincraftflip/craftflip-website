import mongoose from 'mongoose'

// The text of a converted flipbook's pages, for text search (October 2026, utils/textSearch.js).
// Kept out of the Flipbook document so the dashboard, viewer and publishing queries never load it.
// One document per flipbook; attemptId is the conversion attempt the text belongs to, and a
// search reads it only when it matches Flipbook.textSearch.attemptId. Private: only search
// snippets ever leave the server. Deleted with the flipbook.
const flipbookTextSchema = new mongoose.Schema(
  {
    flipbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flipbook', required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attemptId: { type: String, required: true },
    // Index = page number - 1; '' for a page without text.
    pages: { type: [String], default: [] },
    characters: { type: Number, required: true },
  },
  { timestamps: true }
)

const FlipbookText = mongoose.model('FlipbookText', flipbookTextSchema)

export default FlipbookText
