import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentsFormProblem, contentsUpdate, readerFormProblem, readerOf, readerUpdate } from './readerSettings.js'
import { CONTENTS_SIDE_PANEL_MIN_WIDTH, contentsPanelLayout, currentSectionIndex } from './readerControls.js'
import { CONTENTS_BUTTON_PX, CTA_BESIDE_NAV_MIN_WIDTH, CTA_MAX_WIDTH_PX, TOOLBAR_MAX_WIDTH_PX, ctaPlacement } from './bookLayout.js'

// Table of contents (October 2026): settings, the current section and the panel layout.

const CONTENTS = [
  { title: 'Welcome', page: 1 },
  { title: 'Amenities', page: 4 },
  { title: 'Location', page: 5 },
  { title: 'Floor plans', page: 12 },
]

test('contents are read from either API in page order, without malformed sections or pages past the book', () => {
  assert.deepEqual(readerOf({}).contents, [])
  assert.deepEqual(readerOf({ reader: { contents: null } }).contents, [])
  const contents = [
    { title: 'Floor plans', page: 12 },
    { title: 'Welcome', page: 1 },
    { title: '', page: 2 },
    { title: '   ', page: 2 },
    { title: 'Half', page: 2.5 },
    { title: 'Zero', page: 0 },
    { title: 'Text page', page: '3' },
    { title: 'Past the end', page: 40 },
    null,
  ]
  assert.deepEqual(readerOf({ pageCount: 20, reader: { contents } }).contents, [
    { title: 'Welcome', page: 1 },
    { title: 'Floor plans', page: 12 },
  ])
  // Without a page count (should not happen), sections are not cut off.
  assert.equal(readerOf({ reader: { contents } }).contents.length, 3)
})

test('the contents rows are checked against the page count before saving', () => {
  const rows = [
    { title: 'Welcome', page: '1' },
    { title: ' Floor plans ', page: '12' },
  ]
  assert.equal(contentsFormProblem([], null), null)
  assert.equal(contentsFormProblem(rows, 12), null)
  assert.match(contentsFormProblem(rows, null), /once the flipbook is ready/)
  assert.match(contentsFormProblem([{ title: '  ', page: '1' }], 12), /Section 1 needs a title/)
  assert.match(contentsFormProblem([...rows, { title: 'x'.repeat(81), page: '2' }], 12), /at most 80 characters/)
  assert.equal(contentsFormProblem([{ title: 'x'.repeat(80), page: '2' }], 12), null)
  for (const page of ['', '0', '13', '1.5', '-1', 'two', '12345']) {
    assert.match(contentsFormProblem([{ title: 'Gallery', page }], 12), /Section 1 needs a page from 1 to 12/, page)
  }
  const tooMany = Array.from({ length: 51 }, () => ({ title: 'Section', page: '1' }))
  assert.match(contentsFormProblem(tooMany, 100), /at most 50 sections/)
})

test('saved contents are tidied and sorted by page, and sent with the other settings', () => {
  const rows = [
    { key: 1, title: ' Floor \n plans ', page: '12' },
    { key: 2, title: 'Welcome', page: '1' },
    { key: 3, title: 'Location', page: '5' },
  ]
  assert.deepEqual(contentsUpdate(rows), [
    { title: 'Welcome', page: 1 },
    { title: 'Location', page: 5 },
    { title: 'Floor plans', page: 12 },
  ])
  const form = {
    primaryColor: null,
    background: { kind: 'default', color: null, preset: null },
    cta: { enabled: false, label: '', url: '' },
    allowDownload: false,
    contents: rows,
  }
  assert.equal(readerFormProblem(form, 12), null)
  assert.match(readerFormProblem(form, 10), /Section 1 needs a page from 1 to 10/)
  assert.deepEqual(readerUpdate(form).reader.contents, contentsUpdate(rows))
  assert.deepEqual(readerUpdate({ ...form, contents: [] }).reader.contents, [])
})

test('the current section is the last one starting on or before the last page on screen', () => {
  assert.equal(currentSectionIndex(CONTENTS, [1]), 0)
  assert.equal(currentSectionIndex(CONTENTS, [2, 3]), 0)
  // A section starting on the right-hand page of a spread is already current.
  assert.equal(currentSectionIndex(CONTENTS, [4, 5]), 2)
  assert.equal(currentSectionIndex(CONTENTS, [11]), 2)
  assert.equal(currentSectionIndex(CONTENTS, [20]), 3)
  assert.equal(currentSectionIndex([{ title: 'Gallery', page: 3 }], [1]), -1)
  assert.equal(currentSectionIndex([], [1]), -1)
  assert.equal(currentSectionIndex(CONTENTS, []), -1)
})

test('the contents panel opens beside the book on wide stages and covers the stage on narrow ones', () => {
  assert.equal(contentsPanelLayout(320), 'cover')
  assert.equal(contentsPanelLayout(390), 'cover')
  assert.equal(contentsPanelLayout(CONTENTS_SIDE_PANEL_MIN_WIDTH - 1), 'cover')
  assert.equal(contentsPanelLayout(CONTENTS_SIDE_PANEL_MIN_WIDTH), 'side')
  assert.equal(contentsPanelLayout(1440), 'side')
})

test('with a Contents button the floating button moves beside the wider toolbar only when it still fits', () => {
  const at = (width, hasContents) => ctaPlacement({ width, height: 700 }, true, { hasContents }).placement
  assert.equal(at(CTA_BESIDE_NAV_MIN_WIDTH, false), 'beside-nav')
  assert.equal(at(CTA_BESIDE_NAV_MIN_WIDTH, true), 'below-nav')
  assert.equal(at(CTA_BESIDE_NAV_MIN_WIDTH + CONTENTS_BUTTON_PX, true), 'beside-nav')
  const width = CTA_BESIDE_NAV_MIN_WIDTH + CONTENTS_BUTTON_PX
  assert.ok(width / 2 + (TOOLBAR_MAX_WIDTH_PX + CONTENTS_BUTTON_PX) / 2 + 12 <= width - 12 - CTA_MAX_WIDTH_PX)
  // Without a call to action nothing changes.
  assert.equal(ctaPlacement({ width: 390, height: 700 }, false, { hasContents: true }).placement, null)
})
