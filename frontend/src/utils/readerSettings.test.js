import { test } from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  BACKGROUND_IMAGE_TREATMENT,
  BACKGROUND_PRESETS,
  DEFAULT_READER,
  backgroundAppearance,
  ctaToShow,
  embedCode,
  isSafeWebUrl,
  presetImageUrl,
  publicBackgroundUrl,
  publicDownloadUrl,
  publicLogoUrl,
  readableTextColor,
  readerFormProblem,
  readerOf,
  readerUpdate,
  removeBackground,
  removeLogo,
  uploadBackground,
  uploadLogo,
} from './readerSettings.js'

const FORM = { primaryColor: '#1F4E79', background: { kind: 'preset', color: '#F4EFE6', preset: 'warm-wood' }, cta: { enabled: true, label: ' Book a viewing ', url: ' https://agency.example/book ' }, allowDownload: true }

test('saved settings are restored, with defaults for flipbooks that have none', () => {
  assert.deepEqual(readerOf({}), DEFAULT_READER)
  assert.deepEqual(readerOf(undefined), DEFAULT_READER)
  const saved = readerOf({ reader: { primaryColor: '#1f4e79', cta: { enabled: true, label: 'Call', url: 'https://a.example' }, allowDownload: true } })
  assert.equal(saved.primaryColor, '#1f4e79')
  assert.equal(saved.cta.label, 'Call')
  assert.equal(saved.allowDownload, true)
  assert.equal(saved.logo, null)
})

test('the form is checked before saving with clear messages', () => {
  assert.equal(readerFormProblem(FORM), null)
  assert.match(readerFormProblem({ ...FORM, primaryColor: 'blue' }), /#1f4e79/)
  assert.match(readerFormProblem({ ...FORM, cta: { enabled: true, label: '', url: 'https://a.example' } }), /label and a link/)
  assert.match(readerFormProblem({ ...FORM, cta: { enabled: false, label: 'x', url: 'javascript:alert(1)' } }), /https:\/\//)
  assert.match(readerFormProblem({ ...FORM, cta: { enabled: true, label: 'x'.repeat(41), url: 'https://a.example' } }), /40/)
})

test('the saved body holds exactly the reader fields, trimmed and lowercased', () => {
  assert.deepEqual(readerUpdate(FORM), {
    reader: { primaryColor: '#1f4e79', background: { kind: 'preset', color: '#f4efe6', preset: 'warm-wood' }, cta: { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' }, allowDownload: true },
  })
})

test('the button shows only when switched on, labelled and pointing to a safe web link', () => {
  assert.deepEqual(ctaToShow({ cta: { enabled: true, label: 'Call', url: 'https://agency.example' } }), { label: 'Call', url: 'https://agency.example' })
  assert.equal(ctaToShow({ cta: { enabled: false, label: 'Call', url: 'https://agency.example' } }), null)
  assert.equal(ctaToShow({ cta: null }), null)
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'agency.example', 'https://user:pw@agency.example']) {
    assert.equal(isSafeWebUrl(url), false, url)
    assert.equal(ctaToShow({ cta: { enabled: true, label: 'Call', url } }), null, url)
  }
  // The public API sends { label, url } only for a shown button.
  assert.deepEqual(ctaToShow({ cta: { label: 'Call', url: 'https://agency.example' } }), { label: 'Call', url: 'https://agency.example' })
})

test('text on a brand colour stays readable', () => {
  assert.equal(readableTextColor('#1f4e79'), '#ffffff')
  assert.equal(readableTextColor('#f5d76e'), '#1c1917')
  assert.equal(readableTextColor('not-a-colour'), null)
})

test('public logo and download addresses use the public API with the slug only', () => {
  assert.equal(publicLogoUrl('https://api.example', 'riverside-ab12', 1700000000000), 'https://api.example/api/public/flipbooks/riverside-ab12/logo?v=1700000000000')
  assert.equal(publicDownloadUrl('https://api.example', 'riverside-ab12'), 'https://api.example/api/public/flipbooks/riverside-ab12/download')
})

test('logo upload and removal return the server flipbook or the message', async () => {
  const calls = []
  const client = {
    async post(url, body) {
      calls.push(['post', url, body instanceof FormData && body.has('logo')])
      return { data: { data: { flipbook: { id: 'a', reader: { logo: { width: 10, height: 5, revision: 1 } } } } } }
    },
    async delete(url) {
      calls.push(['delete', url])
      throw Object.assign(new Error('x'), { response: { status: 404, data: { success: false, message: 'Flipbook not found.' } } })
    },
  }
  const uploaded = await uploadLogo(client, 'a', new Blob(['png']))
  assert.equal(uploaded.ok, true)
  assert.deepEqual(calls[0], ['post', '/api/flipbooks/a/logo', true])
  assert.deepEqual(await removeLogo(client, 'a'), { ok: false, missing: true, message: 'Flipbook not found.' })
})

test('embed code points at the public embed route, escapes the title and limits sizes', () => {
  const responsive = embedCode({ origin: 'https://flip.thecraftaxis.com', slug: 'riverside-ab12', title: 'Riverside "Homes" <2026>' })
  assert.match(responsive, /src="https:\/\/flip\.thecraftaxis\.com\/embed\/riverside-ab12"/)
  assert.match(responsive, /title="Riverside &quot;Homes&quot; &lt;2026&gt;"/)
  assert.match(responsive, /aspect-ratio:3\/2/)
  assert.doesNotMatch(responsive, /<2026>|"Homes"/)

  const fixed = embedCode({ origin: 'https://x.example', slug: 's-ab12', title: 'T', responsive: false, width: 99999, height: 10 })
  assert.match(fixed, /width="2000" height="320"/)
  assert.match(embedCode({ origin: 'https://x.example', slug: 's-ab12', title: 'T', responsive: false, width: '100%', height: 700 }), /width="100%" height="700"/)
  assert.match(fixed, /loading="lazy" allowfullscreen/)
})

test('the public shape (button sent only when shown) and the owner shape both lead to the right button', () => {
  // Public API: { label, url } for a shown button, null otherwise.
  assert.deepEqual(ctaToShow(readerOf({ reader: { cta: { label: 'Book a viewing', url: 'https://agency.example/book' } } })), {
    label: 'Book a viewing',
    url: 'https://agency.example/book',
  })
  assert.equal(ctaToShow(readerOf({ reader: { cta: null } })), null)
  // Owner API: { enabled, label, url }; a switched-off button stays hidden.
  assert.equal(ctaToShow(readerOf({ reader: { cta: { enabled: false, label: 'Later', url: 'https://agency.example' } } })), null)
  assert.ok(ctaToShow(readerOf({ reader: { cta: { enabled: true, label: 'Now', url: 'https://agency.example' } } })))
})

test('the background is restored from either API shape; anything incomplete reads as the default', () => {
  assert.deepEqual(readerOf({}).background, { kind: 'default', color: null, preset: null, image: null })
  // Older flipbooks may still carry the retired top-bar colour; it is not part of the settings.
  assert.equal('accentColor' in readerOf({ reader: { accentColor: '#112233' } }), false)
  const owner = readerOf({ reader: { background: { kind: 'image', color: '#000000', preset: 'warm-wood', image: { width: 10, height: 5, revision: 7, tone: 'dark' } } } })
  assert.deepEqual(owner.background, { kind: 'image', color: '#000000', preset: 'warm-wood', image: { width: 10, height: 5, revision: 7, tone: 'dark' } })
  const publicImage = readerOf({ reader: { background: { kind: 'image', revision: 7, tone: 'dark' } } })
  assert.deepEqual(publicImage.background.image, { revision: 7, tone: 'dark' })
  assert.equal(readerOf({ reader: { background: { kind: 'preset', preset: 'misty-forest', tone: 'dark' } } }).background.preset, 'misty-forest')
  for (const background of [{ kind: 'color', color: 'red' }, { kind: 'preset', preset: 'gone' }, { kind: 'image' }, { kind: 'video' }]) {
    assert.equal(readerOf({ reader: { background } }).background.kind, 'default', JSON.stringify(background))
  }
})

test('the background form needs a colour or a preset for those kinds', () => {
  assert.equal(readerFormProblem({ ...FORM, background: { kind: 'default', color: null, preset: null } }), null)
  assert.equal(readerFormProblem({ ...FORM, background: { kind: 'color', color: '#112233', preset: null } }), null)
  assert.match(readerFormProblem({ ...FORM, background: { kind: 'color', color: null, preset: null } }), /background colour/)
  assert.match(readerFormProblem({ ...FORM, background: { kind: 'color', color: 'url(x)', preset: null } }), /#1f4e79/)
  assert.match(readerFormProblem({ ...FORM, background: { kind: 'preset', color: null, preset: 'nope' } }), /preset/)
})

test('solid colours are drawn as they are; preset and uploaded images get the same blur and a wash matching their tone', () => {
  assert.equal(backgroundAppearance({ kind: 'default' }, null), null)
  assert.equal(backgroundAppearance(undefined, null), null)
  // A colour is clean: no image layer, so no blur or wash.
  assert.deepEqual(backgroundAppearance({ kind: 'color', color: '#1f4e79' }, null), { color: '#1f4e79', image: null, tone: 'dark' })
  assert.equal(backgroundAppearance({ kind: 'color', color: '#f5f5f4' }, null).tone, 'light')

  const { blurPx, overlay } = BACKGROUND_IMAGE_TREATMENT
  // Restrained: the image stays recognisable and the wash only softens it.
  assert.ok(blurPx >= 3 && blurPx <= 10, String(blurPx))
  for (const wash of Object.values(overlay)) {
    const alpha = Number(/,\s*([\d.]+)\)$/.exec(wash)[1])
    assert.ok(alpha > 0 && alpha <= 0.5, wash)
  }

  const dark = backgroundAppearance({ kind: 'preset', preset: 'misty-forest' }, null)
  assert.deepEqual(dark, { color: '#44403c', image: { url: '/reader-backgrounds/misty-forest.webp', blurPx, overlay: overlay.dark }, tone: 'dark' })
  for (const preset of BACKGROUND_PRESETS) {
    const drawn = backgroundAppearance({ kind: 'preset', preset: preset.id }, null)
    assert.equal(drawn.image.blurPx, blurPx, preset.id)
    assert.equal(drawn.image.overlay, overlay[preset.tone], preset.id)
  }

  const image = { kind: 'image', image: { revision: 3, tone: 'light' } }
  // While the uploaded image loads, a plain matching colour holds its place.
  assert.deepEqual(backgroundAppearance(image, null), { color: '#e7e5e4', image: null, tone: 'light' })
  const url = 'https://api.example/api/public/flipbooks/s-ab12/background?v=3'
  // The upload gets exactly the treatment of a preset with the same tone.
  assert.deepEqual(backgroundAppearance(image, url).image, { url, blurPx, overlay: overlay.light })
})

test('every preset has a bundled image and a public background address uses the slug only', () => {
  assert.equal(BACKGROUND_PRESETS.length, 4)
  for (const preset of BACKGROUND_PRESETS) {
    assert.match(preset.id, /^[a-z-]+$/)
    assert.ok(fs.existsSync(new URL(`../../public${presetImageUrl(preset.id)}`, import.meta.url)), preset.id)
    assert.ok(fs.existsSync(new URL(`../../public/reader-backgrounds/${preset.id}-thumb.webp`, import.meta.url)), preset.id)
  }
  assert.equal(publicBackgroundUrl('https://api.example', 'riverside-ab12', 5), 'https://api.example/api/public/flipbooks/riverside-ab12/background?v=5')
})

test('background upload and removal use their own routes and return the server flipbook or the message', async () => {
  const calls = []
  const client = {
    async post(url, body) {
      calls.push(['post', url, body instanceof FormData && body.has('background')])
      return { data: { data: { flipbook: { id: 'a', reader: { background: { kind: 'image' } } } } } }
    },
    async delete(url) {
      calls.push(['delete', url])
      throw Object.assign(new Error('x'), { response: { status: 409, data: { success: false, message: 'This flipbook is being deleted.' } } })
    },
  }
  assert.equal((await uploadBackground(client, 'a', new Blob(['jpg']))).flipbook.reader.background.kind, 'image')
  assert.deepEqual(calls[0], ['post', '/api/flipbooks/a/background', true])
  assert.deepEqual(await removeBackground(client, 'a'), { ok: false, missing: false, message: 'This flipbook is being deleted.' })
  assert.deepEqual(calls[1], ['delete', '/api/flipbooks/a/background'])
})
