import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_VIEWER_STYLE, VIEWER_STYLES, resolveViewerStyle, saveViewerStyle, viewerStyleName } from './viewerStyles.js'

test('the four styles match the backend allowlist, with Luxury Flip as the default', () => {
  assert.deepEqual(VIEWER_STYLES.map((style) => style.id), ['luxury-flip', 'clean-swipe', 'classic-book', 'editorial'])
  assert.equal(DEFAULT_VIEWER_STYLE, 'luxury-flip')
  assert.ok(VIEWER_STYLES.every((style) => style.name && style.description))
})

test('a saved style is restored as is; missing or unknown values fall back to Luxury Flip', () => {
  assert.equal(resolveViewerStyle('editorial'), 'editorial')
  assert.equal(resolveViewerStyle(undefined), 'luxury-flip')
  assert.equal(resolveViewerStyle('neon'), 'luxury-flip')
  assert.equal(viewerStyleName('classic-book'), 'Classic Book')
  assert.equal(viewerStyleName(null), 'Luxury Flip')
})

test('saving sends only the style and returns the server flipbook', async () => {
  const calls = []
  const client = {
    async patch(url, body) {
      calls.push([url, body])
      return { data: { data: { flipbook: { id: 'a', viewerStyle: body.viewerStyle } } } }
    },
  }
  assert.deepEqual(await saveViewerStyle(client, 'a', 'clean-swipe'), { ok: true, flipbook: { id: 'a', viewerStyle: 'clean-swipe' } })
  assert.deepEqual(calls, [['/api/flipbooks/a', { viewerStyle: 'clean-swipe' }]])
})

test('a failed save reports the server message, or a generic one without a response', async () => {
  const refused = {
    async patch() {
      throw Object.assign(new Error('Request failed'), { response: { status: 400, data: { success: false, message: 'Only the viewing style can be changed.' } } })
    },
  }
  assert.deepEqual(await saveViewerStyle(refused, 'a', 'editorial'), { ok: false, message: 'Only the viewing style can be changed.' })

  const offline = {
    async patch() {
      throw new Error('Network Error')
    },
  }
  assert.deepEqual(await saveViewerStyle(offline, 'a', 'editorial'), { ok: false, message: 'Something went wrong. Please try again.' })
})
