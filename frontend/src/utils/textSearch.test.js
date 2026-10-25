import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchAvailability, searchErrorMessage, searchResponseOf, searchSummary, searchableQuery, stepResult } from './textSearch.js'
import { toolbarButtons, toolbarWidth } from './readerControls.js'
import { CTA_BESIDE_NAV_MIN_WIDTH, SEARCH_BUTTON_PX, CONTENTS_BUTTON_PX, ctaPlacement } from './bookLayout.js'

// Text search (October 2026): availability, queries, responses and the toolbar room it needs.

test('the search button is shown for searchable flipbooks and those being prepared, not for others', () => {
  assert.equal(searchAvailability({ search: 'ready' }), 'ready')
  assert.equal(searchAvailability({ search: 'preparing' }), 'preparing')
  for (const flipbook of [{ search: 'unavailable' }, { search: null }, {}, null, undefined, { search: 'yes' }]) {
    assert.equal(searchAvailability(flipbook), null, JSON.stringify(flipbook))
  }
})

test('queries are tidied and need 2 to 100 characters', () => {
  assert.equal(searchableQuery('  ocean   view '), 'ocean view')
  assert.equal(searchableQuery('ab'), 'ab')
  for (const text of ['', ' a ', 'x'.repeat(101), null, undefined]) assert.equal(searchableQuery(text), null, String(text))
})

test('responses keep only well-formed results within the book', () => {
  const data = {
    status: 'ready',
    results: [
      { page: 2, before: 'the ', match: 'Pool', after: ' house', extra: 'dropped' },
      { page: 9, before: '', match: 'Pool', after: '' },
      { page: 1.5, before: '', match: 'x', after: '' },
      { page: 3, before: '', match: '<b>', after: null },
      null,
    ],
    total: 12,
    limited: false,
  }
  assert.deepEqual(searchResponseOf(data, 5), {
    status: 'ready',
    results: [{ page: 2, before: 'the ', match: 'Pool', after: ' house' }],
    total: 12,
    limited: false,
  })
  assert.deepEqual(searchResponseOf({ status: 'preparing' }), { status: 'preparing', results: [], total: 0, limited: false })
  assert.equal(searchResponseOf({ status: 'odd' }).status, 'unavailable')
  assert.equal(searchResponseOf(undefined).status, 'unavailable')
  assert.equal(searchResponseOf({ status: 'ready', results: [{ page: 1, before: '', match: 'a', after: '' }], total: -3 }).total, 1)
})

test('the summary counts results, marks a capped count and says when only the first are listed', () => {
  const one = [{ page: 1 }]
  assert.equal(searchSummary({ results: [], total: 0, limited: false }), 'No results')
  assert.equal(searchSummary({ results: one, total: 1, limited: false }), '1 result')
  assert.equal(searchSummary({ results: [...one, ...one, ...one], total: 3, limited: false }), '3 results')
  assert.equal(searchSummary({ results: Array(200).fill(one[0]), total: 1000, limited: true }), '1,000+ results (first 200 shown)')
})

test('previous and next wrap around, starting at the first or last result', () => {
  assert.equal(stepResult(-1, 5, 1), 0)
  assert.equal(stepResult(-1, 5, -1), 4)
  assert.equal(stepResult(4, 5, 1), 0)
  assert.equal(stepResult(0, 5, -1), 4)
  assert.equal(stepResult(2, 5, 1), 3)
  assert.equal(stepResult(-1, 0, 1), -1)
})

test("a failed search shows the server's message, or a general one", () => {
  assert.equal(searchErrorMessage({ response: { data: { message: 'Too many searches. Please try again in a few minutes.' } } }), 'Too many searches. Please try again in a few minutes.')
  assert.equal(searchErrorMessage(new Error('Network Error')), "Search isn't working right now. Please try again.")
})

test('toolbar: controls that do not fit are left out in order, never overflowing the stage', () => {
  const both = { hasContents: true, hasSearch: true }
  // Without optional buttons the bar is as before: compact from 340px, fullscreen kept.
  assert.deepEqual(toolbarButtons(340, { pageCount: 24 }), { mode: 'compact', contents: false, search: false, contentsInSearch: false, fullscreen: true, pageTotal: true })
  assert.deepEqual(toolbarButtons(320, { pageCount: 24 }).mode, 'minimal')
  assert.equal(toolbarButtons(320, { pageCount: 24 }).fullscreen, true)
  // At 320px search takes the fullscreen button's place; with contents too, they move into search.
  assert.deepEqual(toolbarButtons(320, { hasSearch: true, pageCount: 24 }), { mode: 'minimal', contents: false, search: true, contentsInSearch: false, fullscreen: false, pageTotal: true })
  assert.deepEqual(toolbarButtons(320, { ...both, pageCount: 24 }), { mode: 'minimal', contents: false, search: true, contentsInSearch: true, fullscreen: false, pageTotal: true })
  // Wider phones keep both buttons and fullscreen, giving up the zoom button first.
  assert.deepEqual(toolbarButtons(390, { ...both, pageCount: 24 }), { mode: 'minimal', contents: true, search: true, contentsInSearch: false, fullscreen: true, pageTotal: true })
  assert.equal(toolbarButtons(430, { ...both, pageCount: 24 }).mode, 'compact')
  assert.equal(toolbarButtons(640, { ...both, pageCount: 200 }).mode, 'full')
  // Where fullscreen is not allowed (iPhone, embeds without permission) its room goes to the others.
  assert.equal(toolbarButtons(340, { ...both, pageCount: 24, fullscreenSupported: false }).contents, true)
  assert.equal(toolbarButtons(340, { ...both, pageCount: 24, fullscreenSupported: false }).fullscreen, false)
  // Every combination fits its stage.
  for (const width of [280, 300, 320, 340, 360, 390, 430, 599, 600, 640, 700, 900, 1200]) {
    for (const options of [{}, { hasContents: true }, { hasSearch: true }, both]) {
      for (const pageCount of [8, 24, 200]) {
        const layout = toolbarButtons(width, { ...options, pageCount })
        const needed = toolbarWidth(width, { ...layout, optional: Number(layout.contents) + Number(layout.search), pageCount })
        if (width >= 300) assert.ok(needed <= width, `${width}px ${JSON.stringify(options)} ${pageCount} pages needs ${needed}px`)
      }
    }
  }
})

test('the floating button needs room for every optional toolbar button to sit beside it', () => {
  const stage = { width: CTA_BESIDE_NAV_MIN_WIDTH + SEARCH_BUTTON_PX, height: 800 }
  assert.equal(ctaPlacement(stage, true, { hasSearch: true }).placement, 'beside-nav')
  assert.equal(ctaPlacement(stage, true, { hasSearch: true, hasContents: true }).placement, 'below-nav')
  const both = { width: CTA_BESIDE_NAV_MIN_WIDTH + SEARCH_BUTTON_PX + CONTENTS_BUTTON_PX, height: 800 }
  assert.equal(ctaPlacement(both, true, { hasSearch: true, hasContents: true }).placement, 'beside-nav')
})
