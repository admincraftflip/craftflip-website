import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Flipbook from '../models/Flipbook.js'

test('toSummary never exposes Cloudinary asset details', () => {
  const flipbook = new Flipbook({
    ownerId: new mongoose.Types.ObjectId(),
    title: 'Brochure',
    slug: 'brochure-ab12',
    originalFile: { filename: 'brochure.pdf', sizeBytes: 1234 },
    pdfAsset: { publicId: 'craftflip/users/u/flipbooks/f/original.pdf', version: 1, resourceType: 'raw', deliveryType: 'authenticated' },
  })

  const serialized = JSON.stringify(flipbook.toSummary())
  assert.doesNotMatch(serialized, /craftflip\/users|cloudinary|publicId|pdfAsset|ownerId/i)
  assert.equal(flipbook.toSummary().status, 'uploaded')
})
