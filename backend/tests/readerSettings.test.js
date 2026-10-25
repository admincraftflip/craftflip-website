import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentsMaxPage, ownerReaderView, parseReaderUpdate, publicReaderView, safeWebUrl } from '../utils/readerSettings.js'

test('colours are 6-digit hex values, lowercased, or null for the default', () => {
  assert.deepEqual(parseReaderUpdate({ primaryColor: '#1F4E79' }), { set: { 'reader.primaryColor': '#1f4e79' } })
  assert.deepEqual(parseReaderUpdate({ primaryColor: null }), { set: { 'reader.primaryColor': null } })
  for (const bad of ['red', '#fff', '#12345g', '1f4e79', 'url(javascript:alert(1))', '#1f4e79;background:red', 123, '']) {
    assert.ok(parseReaderUpdate({ primaryColor: bad }).error, String(bad))
  }
})

test('only http and https links with a real host and no credentials are accepted', () => {
  assert.equal(safeWebUrl(' https://www.example.com/contact?x=1 '), 'https://www.example.com/contact?x=1')
  assert.equal(safeWebUrl('http://example.org'), 'http://example.org/')
  for (const bad of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'ftp://example.com',
    '//example.com',
    '/relative/path',
    'example.com',
    'https://',
    'https://localhost',
    'https://user:pass@example.com',
    'https://' + 'a'.repeat(2050) + '.com',
    '',
    null,
  ]) {
    assert.equal(safeWebUrl(bad), null, String(bad))
  }
})

test('the call to action is sent whole and validated; a shown button needs a label and a safe link', () => {
  assert.deepEqual(parseReaderUpdate({ cta: { enabled: true, label: '  Book a  viewing ', url: 'https://agency.example/book' } }), {
    set: { 'reader.cta': { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' } },
  })
  assert.deepEqual(parseReaderUpdate({ cta: { enabled: false, label: '', url: '' } }), { set: { 'reader.cta': { enabled: false, label: '', url: '' } } })
  const refused = [
    { enabled: true, label: '', url: 'https://agency.example' },
    { enabled: true, label: 'Call us', url: '' },
    { enabled: true, label: 'Call us', url: 'javascript:alert(1)' },
    { enabled: false, label: 'Later', url: 'javascript:alert(1)' },
    { enabled: true, label: 'x'.repeat(41), url: 'https://agency.example' },
    { enabled: 'yes', label: 'Call', url: 'https://agency.example' },
    { enabled: true, label: 'Call' },
    { enabled: true, label: 'Call', url: 'https://agency.example', target: '_self' },
    'https://agency.example',
  ]
  for (const cta of refused) assert.ok(parseReaderUpdate({ cta }).error, JSON.stringify(cta))
})

test('reader updates accept only the allowed fields; the logo cannot be set here', () => {
  for (const reader of [{}, null, [], 'x', { logo: { publicId: 'someone-elses' } }, { allowDownload: 'true' }, { primaryColor: '#000000', fontFamily: 'x' }, { accentColor: '#000000' }]) {
    assert.ok(parseReaderUpdate(reader).error, JSON.stringify(reader))
  }
  assert.deepEqual(parseReaderUpdate({ allowDownload: true }), { set: { 'reader.allowDownload': true } })
})

test('older flipbooks without settings read as the defaults: no colours, logo, button or download', () => {
  const background = { kind: 'default', color: null, preset: null, image: null }
  const defaults = { primaryColor: null, background, logo: null, cta: { enabled: false, label: '', url: '' }, allowDownload: false, contents: [] }
  assert.deepEqual(ownerReaderView(undefined), defaults)
  assert.deepEqual(ownerReaderView({}), defaults)
  assert.deepEqual(publicReaderView(undefined), { ...defaults, background: { kind: 'default' }, cta: null })
  // The retired top-bar colour of older flipbooks is never sent.
  assert.equal('accentColor' in ownerReaderView({ accentColor: '#112233' }), false)
  assert.equal('accentColor' in publicReaderView({ accentColor: '#112233' }), false)
})

test('the public view shows the button only when enabled and complete, and never the logo storage details', () => {
  const reader = {
    primaryColor: '#1f4e79',
    logo: { publicId: 'craftflip/users/u/flipbooks/f/branding/logo-1', version: 9, format: 'webp', width: 320, height: 80, uploadedAt: new Date('2026-10-16T10:00:00Z') },
    cta: { enabled: true, label: 'Book a viewing', url: 'https://agency.example/book' },
    allowDownload: true,
  }
  const view = publicReaderView(reader)
  assert.deepEqual(view.cta, { label: 'Book a viewing', url: 'https://agency.example/book' })
  assert.deepEqual(view.logo, { width: 320, height: 80, revision: Date.parse('2026-10-16T10:00:00Z') })
  assert.doesNotMatch(JSON.stringify(view), /craftflip\/users|publicId|version/)
  assert.equal(publicReaderView({ ...reader, cta: { ...reader.cta, enabled: false } }).cta, null)
  // A link stored before validation existed is checked again on the way out.
  assert.equal(publicReaderView({ ...reader, cta: { enabled: true, label: 'x', url: 'javascript:alert(1)' } }).cta, null)
})

test('the background is sent whole: a kind, a colour and a preset, each validated', () => {
  assert.deepEqual(parseReaderUpdate({ background: { kind: 'color', color: '#F4EFE6', preset: null } }), {
    set: { 'reader.background.kind': 'color', 'reader.background.color': '#f4efe6', 'reader.background.preset': null },
  })
  assert.deepEqual(parseReaderUpdate({ background: { kind: 'preset', color: '#f4efe6', preset: 'warm-wood' } }).set, {
    'reader.background.kind': 'preset',
    'reader.background.color': '#f4efe6',
    'reader.background.preset': 'warm-wood',
  })
  for (const kind of ['default', 'image']) {
    assert.equal(parseReaderUpdate({ background: { kind, color: null, preset: null } }).set['reader.background.kind'], kind)
  }
  const refused = [
    { kind: 'color', color: null, preset: null },
    { kind: 'color', color: 'red', preset: null },
    { kind: 'color', color: 'url(https://tracker.example/x.png)', preset: null },
    { kind: 'preset', color: null, preset: null },
    { kind: 'preset', color: null, preset: 'not-a-preset' },
    { kind: 'preset', color: null, preset: '../../etc/passwd' },
    { kind: 'preset', color: null, preset: 'constructor' },
    { kind: 'video', color: null, preset: null },
    { kind: 'default', color: null },
    { kind: 'image', color: null, preset: null, image: { publicId: 'someone-elses' } },
    { kind: 'default', color: null, preset: null, url: 'https://example.com/bg.jpg' },
    'default',
    null,
  ]
  for (const background of refused) assert.ok(parseReaderUpdate({ background }).error, JSON.stringify(background))
})

test('an incomplete or unknown background reads as the default', () => {
  const image = { publicId: 'craftflip/users/u/flipbooks/f/branding/background-1', version: 2, format: 'webp', width: 2560, height: 1440, tone: 'dark', uploadedAt: new Date('2026-10-16T10:00:00Z') }
  for (const background of [
    { kind: 'color', color: null },
    { kind: 'preset', preset: 'gone' },
    { kind: 'image', image: null },
    { kind: 'sparkles' },
  ]) {
    assert.equal(ownerReaderView({ background }).background.kind, 'default', JSON.stringify(background))
    assert.deepEqual(publicReaderView({ background }).background, { kind: 'default' })
  }
  const owner = ownerReaderView({ background: { kind: 'image', color: '#000000', preset: 'warm-wood', image } }).background
  assert.deepEqual(owner, { kind: 'image', color: '#000000', preset: 'warm-wood', image: { width: 2560, height: 1440, revision: image.uploadedAt.getTime(), tone: 'dark' } })
  assert.doesNotMatch(JSON.stringify(owner), /publicId|craftflip\/users|version/)
  assert.deepEqual(publicReaderView({ background: { kind: 'color', color: '#1f4e79', preset: 'warm-wood', image } }).background, { kind: 'color', color: '#1f4e79' })
  assert.deepEqual(publicReaderView({ background: { kind: 'preset', preset: 'misty-forest', image } }).background, { kind: 'preset', preset: 'misty-forest', tone: 'dark' })
})

test('the contents are sent whole: titles tidied, whole page numbers, sorted by page', () => {
  const { set } = parseReaderUpdate({
    contents: [
      { title: '  Floor \n plans ', page: 12 },
      { title: 'Welcome', page: 1 },
      { title: 'Amenities', page: 5 },
      { title: 'Location', page: 5 },
    ],
  })
  assert.deepEqual(set, {
    'reader.contents': [
      { title: 'Welcome', page: 1 },
      { title: 'Amenities', page: 5 },
      { title: 'Location', page: 5 },
      { title: 'Floor plans', page: 12 },
    ],
  })
  assert.equal(contentsMaxPage(set), 12)
  assert.deepEqual(parseReaderUpdate({ contents: [] }), { set: { 'reader.contents': [] } })
  assert.equal(contentsMaxPage({ 'reader.contents': [] }), 0)
  assert.equal(contentsMaxPage({ 'reader.allowDownload': true }), 0)
  const fifty = Array.from({ length: 50 }, (_, index) => ({ title: `Section ${index + 1}`, page: index + 1 }))
  assert.equal(parseReaderUpdate({ contents: fifty }).set['reader.contents'].length, 50)
  assert.equal(parseReaderUpdate({ contents: [{ title: 'x'.repeat(80), page: 1 }] }).set['reader.contents'][0].title.length, 80)
})

test('invalid contents are refused', () => {
  const refused = [
    null,
    'Welcome',
    { title: 'Welcome', page: 1 },
    Array.from({ length: 51 }, (_, index) => ({ title: `Section ${index + 1}`, page: 1 })),
    [{ title: '', page: 1 }],
    [{ title: '  \n\t ', page: 1 }],
    [{ title: 'x'.repeat(81), page: 1 }],
    [{ title: 42, page: 1 }],
    [{ title: 'Welcome', page: 0 }],
    [{ title: 'Welcome', page: -3 }],
    [{ title: 'Welcome', page: 1.5 }],
    [{ title: 'Welcome', page: '2' }],
    [{ title: 'Welcome', page: Number.NaN }],
    [{ title: 'Welcome' }],
    [{ page: 2 }],
    [{ title: 'Welcome', page: 2, children: [] }],
    [{ title: 'Welcome', page: 2, url: 'https://example.com' }],
    ['Welcome'],
    [null],
  ]
  for (const contents of refused) assert.ok(parseReaderUpdate({ contents }).error, JSON.stringify(contents))
})

test('owner and public views send the stored contents in page order, without malformed entries', () => {
  const contents = [
    { title: 'Floor plans', page: 12, _id: 'internal' },
    { title: 'Welcome', page: 1 },
    { title: '', page: 3 },
    { title: 'Broken', page: 2.5 },
    null,
  ]
  const expected = [
    { title: 'Welcome', page: 1 },
    { title: 'Floor plans', page: 12 },
  ]
  assert.deepEqual(ownerReaderView({ contents }).contents, expected)
  assert.deepEqual(publicReaderView({ contents }).contents, expected)
  // Never a section for a page the book does not have.
  assert.deepEqual(publicReaderView({ contents }, 10).contents, [{ title: 'Welcome', page: 1 }])
  assert.deepEqual(ownerReaderView({ contents: 'x' }).contents, [])
})
