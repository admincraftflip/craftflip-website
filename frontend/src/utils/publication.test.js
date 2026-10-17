import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canPublish, copyLink, isLive, publicFlipbookUrl, publicViewerStateFor } from './publication.js'

test('the public link is built from the slug on the current origin', () => {
  assert.equal(publicFlipbookUrl('https://flip.thecraftaxis.com', 'et-listing-x7k2'), 'https://flip.thecraftaxis.com/view/et-listing-x7k2')
})

test('a link is live only for a Ready flipbook the server reports as published', () => {
  assert.equal(isLive({ status: 'ready', isPublished: true }), true)
  assert.equal(isLive({ status: 'ready', isPublished: false }), false)
  assert.equal(isLive({ status: 'deleting', isPublished: true }), false)
  assert.equal(isLive({ status: 'processing', isPublished: true }), false)
})

test('only unpublished Ready flipbooks offer Publish', () => {
  assert.equal(canPublish({ status: 'ready', isPublished: false }), true)
  assert.equal(canPublish({ status: 'ready', isPublished: true }), false)
  for (const status of ['uploaded', 'processing', 'failed', 'deleting']) {
    assert.equal(canPublish({ status, isPublished: false }), false)
  }
})

test('the public viewer shows "not found" for any 404 and the general error otherwise', () => {
  assert.equal(publicViewerStateFor({ response: { status: 404 } }), 'notFound')
  assert.equal(publicViewerStateFor({ response: { status: 429 } }), 'error')
  assert.equal(publicViewerStateFor({ response: { status: 500 } }), 'error')
  assert.equal(publicViewerStateFor(new Error('Network Error')), 'error')
})

test('copying the link reports success, and failure when the clipboard is missing or refuses', async () => {
  const written = []
  assert.equal(await copyLink({ writeText: async (text) => written.push(text) }, 'https://x/view/a-b12c'), true)
  assert.deepEqual(written, ['https://x/view/a-b12c'])

  assert.equal(await copyLink(undefined, 'https://x/view/a'), false)
  assert.equal(
    await copyLink({
      writeText: async () => {
        throw new Error('NotAllowedError')
      },
    }, 'https://x/view/a'),
    false
  )
})
