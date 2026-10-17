import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageImageContentType, pageImageVariant } from '../utils/pageImageVariant.js'

test('only the full page or the fixed thumbnail size can be requested', () => {
  assert.equal(pageImageVariant({}), 'full')
  assert.equal(pageImageVariant(undefined), 'full')
  assert.equal(pageImageVariant({ size: 'thumb' }), 'thumb')
  for (const size of ['full', 'THUMB', '', 'w_4000', ['thumb'], { width: 10 }]) {
    assert.equal(pageImageVariant({ size }), null, JSON.stringify(size))
  }
})

test('previews are WebP; full pages keep their stored type', () => {
  assert.equal(pageImageContentType('thumb', 'png'), 'image/webp')
  assert.equal(pageImageContentType('full', 'png'), 'image/png')
  assert.equal(pageImageContentType('full', 'jpg'), 'image/jpeg')
  assert.equal(pageImageContentType('full', 'tiff'), 'application/octet-stream')
})
