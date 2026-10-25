import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_COUNTED_MATCHES,
  MAX_FLIPBOOK_TEXT_LENGTH,
  MAX_PAGE_TEXT_LENGTH,
  MAX_RESULTS,
  foldPage,
  limitFlipbookText,
  parseQuery,
  searchPages,
  searchStatus,
  textFromItems,
} from '../utils/pageText.js'

test('page text joins the pdf.js strings with a space at line ends, tidied and limited', () => {
  const items = [
    { str: 'Ocean', hasEOL: false },
    { str: ' view', hasEOL: true },
    { str: 'villa\u0000with\tpool', hasEOL: false },
    { width: 0 },
    { str: '   ', hasEOL: true },
    { str: 'Café', hasEOL: false },
  ]
  assert.equal(textFromItems(items), 'Ocean view villa with pool Café')
  assert.equal(textFromItems([]), '')
  assert.equal(textFromItems(undefined), '')
  assert.equal(textFromItems([{ str: 'x'.repeat(MAX_PAGE_TEXT_LENGTH + 50) }]).length, MAX_PAGE_TEXT_LENGTH)
})

test('a flipbook keeps at most the total budget of text and knows when it has none', () => {
  assert.deepEqual(limitFlipbookText(['', '', '']), { pages: ['', '', ''], characters: 0, hasText: false })
  assert.deepEqual(limitFlipbookText(['Welcome', '', 'Pricing']), { pages: ['Welcome', '', 'Pricing'], characters: 14, hasText: true })
  const big = 'x'.repeat(MAX_PAGE_TEXT_LENGTH)
  const pageCount = Math.ceil(MAX_FLIPBOOK_TEXT_LENGTH / MAX_PAGE_TEXT_LENGTH) + 2
  const limited = limitFlipbookText(Array(pageCount).fill(big))
  assert.equal(limited.characters, MAX_FLIPBOOK_TEXT_LENGTH)
  assert.equal(limited.pages.at(-1), '')
  assert.equal(limited.pages.length, pageCount)
})

test('queries are tidied and folded; too short or too long ones are refused', () => {
  assert.equal(parseQuery('  Café   Terrace '), 'cafe terrace')
  assert.equal(parseQuery('ÉTÉ'), 'ete')
  for (const value of ['', ' a ', 'x'.repeat(101), null, undefined, ['pool', 'spa'], 42]) assert.equal(parseQuery(value), null, JSON.stringify(value))
  assert.equal(parseQuery('x'.repeat(100)).length, 100)
})

test('search ignores case and accents and shows each match in its original spelling, with context', () => {
  const pages = ['The Café Terrace opens at noon.', '', 'Visit the cafe terrace and the CAFÉ bar.'].map(foldPage)
  const { results, total, limited } = searchPages(pages, parseQuery('cafe'))
  assert.equal(total, 3)
  assert.equal(limited, false)
  assert.deepEqual(results[0], { page: 1, before: 'The ', match: 'Café', after: ' Terrace opens at noon.' })
  assert.deepEqual(
    results.map((result) => [result.page, result.match]),
    [
      [1, 'Café'],
      [3, 'cafe'],
      [3, 'CAFÉ'],
    ]
  )
  assert.deepEqual(searchPages(pages, parseQuery('pool')), { results: [], total: 0, limited: false })
  // Compatibility forms: the "ﬁ" ligature reads as "fi".
  assert.equal(searchPages([foldPage('Oﬃce ﬂoor plans')], parseQuery('office')).results[0].match, 'Oﬃce')
  assert.equal(searchPages([foldPage('Oﬃce ﬂoor plans')], parseQuery('floor')).results[0].match, 'ﬂoor')
})

test('snippets are cut at word boundaries with an ellipsis', () => {
  const words = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ')
  const [result] = searchPages([foldPage(words)], parseQuery('word30')).results
  assert.equal(result.match, 'word30')
  assert.ok(result.before.startsWith('…word'), result.before)
  assert.ok(result.before.endsWith(' '))
  assert.ok(result.after.endsWith('…'), result.after)
  assert.ok(result.before.length <= 52 && result.after.length <= 72)
})

test('results stop at the result limit and counting stops at the match limit', () => {
  const page = foldPage('spa '.repeat(400))
  const many = searchPages([page, page, page], parseQuery('spa'))
  assert.equal(many.results.length, MAX_RESULTS)
  assert.equal(many.total, MAX_COUNTED_MATCHES)
  assert.equal(many.limited, true)
  assert.equal(many.results.at(-1).page, 1)
})

test('search status: ready, preparing for older flipbooks, unavailable without text or after every attempt', () => {
  assert.equal(searchStatus({ status: 'processing' }), null)
  assert.equal(searchStatus({ status: 'ready', textSearch: { status: 'ready' } }), 'ready')
  assert.equal(searchStatus({ status: 'ready', textSearch: { status: 'empty' } }), 'unavailable')
  assert.equal(searchStatus({ status: 'ready' }), 'preparing')
  assert.equal(searchStatus({ status: 'ready', textSearch: { status: null, attempts: 2 } }), 'preparing')
  assert.equal(searchStatus({ status: 'ready', textSearch: { status: null, attempts: 3 } }), 'unavailable')
})
