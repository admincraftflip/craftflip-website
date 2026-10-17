import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CTA_MAX_WIDTH_PX, CTA_STRIP_PX, TOOLBAR_MAX_WIDTH_PX, ctaPlacement, fitBook, isAtLastPage, visiblePagesLabel } from './bookLayout.js'

const PORTRAIT = 1600 / 2071
const LANDSCAPE = 2071 / 1600

test('a wide desktop stage shows portrait pages as a two-page spread that fits', () => {
  const layout = fitBook({ width: 1568, height: 650 }, PORTRAIT)
  assert.equal(layout.spread, true)
  assert.ok(layout.height <= 650 - 88)
  assert.ok(layout.width * 2 <= 1568 - 32)
})

test('a phone stage shows one page that fits the width', () => {
  const layout = fitBook({ width: 390, height: 700 }, PORTRAIT)
  assert.equal(layout.spread, false)
  assert.ok(layout.width <= 390 - 32)
  assert.ok(layout.height <= 700 - 88)
})

test('landscape pages fit on desktop and phone without exceeding the stage', () => {
  for (const stage of [{ width: 1568, height: 650 }, { width: 390, height: 700 }, { width: 1024, height: 1366 }]) {
    const layout = fitBook(stage, LANDSCAPE)
    const bookWidth = layout.spread ? layout.width * 2 : layout.width
    assert.ok(bookWidth <= stage.width - 32, `width fits ${stage.width}x${stage.height}`)
    assert.ok(layout.height <= stage.height - 88, `height fits ${stage.width}x${stage.height}`)
    assert.ok(layout.width > 0 && layout.height > 0)
  }
})

test('a stage too small for the book still gives positive page sizes', () => {
  const layout = fitBook({ width: 20, height: 40 }, PORTRAIT)
  assert.ok(layout.width >= 1 && layout.height >= 1)
})

test('the page indicator shows the cover alone and inner pages as pairs on a spread', () => {
  assert.equal(visiblePagesLabel(0, 20, true), '1')
  assert.equal(visiblePagesLabel(1, 20, true), '2–3')
  assert.equal(visiblePagesLabel(17, 20, true), '18–19')
  assert.equal(visiblePagesLabel(19, 20, true), '20')
  assert.equal(visiblePagesLabel(19, 21, true), '20–21')
  assert.equal(visiblePagesLabel(4, 20, false), '5')
})

test('the end of the book is detected for single pages and spreads, even and odd page counts', () => {
  assert.equal(isAtLastPage(0, 1, true), true)
  assert.equal(isAtLastPage(0, 1, false), true)
  assert.equal(isAtLastPage(0, 2, true), false)
  assert.equal(isAtLastPage(1, 2, true), true)
  assert.equal(isAtLastPage(17, 20, true), false)
  assert.equal(isAtLastPage(19, 20, true), true)
  assert.equal(isAtLastPage(19, 21, true), true)
  assert.equal(isAtLastPage(18, 20, false), false)
  assert.equal(isAtLastPage(19, 20, false), true)
})

test('CSS styles show the cover alone, then spreads in page order, and the last page alone when the count is even', async () => {
  const { buildViews, viewLabel } = await import('./bookLayout.js')
  assert.deepEqual(buildViews(20, true).slice(0, 3), [[1], [2, 3], [4, 5]])
  assert.deepEqual(buildViews(20, true).at(-1), [20])
  assert.equal(buildViews(20, true).length, 11)
  assert.deepEqual(buildViews(21, true).at(-1), [20, 21])
  assert.deepEqual(buildViews(5, false), [[1], [2], [3], [4], [5]])
  assert.deepEqual(buildViews(1, true), [[1]])
  assert.deepEqual(buildViews(2, true), [[1], [2]])
  // Every page appears exactly once, in order.
  for (const [count, spread] of [[20, true], [21, true], [7, false], [3, true]]) {
    assert.deepEqual(buildViews(count, spread).flat(), Array.from({ length: count }, (_, index) => index + 1))
  }
  assert.equal(viewLabel([2, 3]), '2–3')
  assert.equal(viewLabel([1]), '1')
})

test('without a call to action the stage is unchanged', () => {
  const stage = { width: 390, height: 700 }
  assert.deepEqual(ctaPlacement(stage, false), { stage, navInset: 0, placement: null })
})

test('on a wide stage the floating button sits beside the centred navigation and the book keeps its size', () => {
  for (const width of [980, 1024, 1568]) {
    const stage = { width, height: 650 }
    const placed = ctaPlacement(stage, true)
    assert.equal(placed.placement, 'beside-nav')
    assert.deepEqual(placed.stage, stage)
    assert.equal(placed.navInset, 0)
    // The toolbar is centred; a button of up to 15rem (240px) at the right edge, 12px in, still
    // leaves a gap of at least 12px.
    assert.ok(width / 2 + TOOLBAR_MAX_WIDTH_PX / 2 + 12 <= width - 12 - CTA_MAX_WIDTH_PX, `${width}`)
  }
})

test('on a phone or narrow embed a strip below the navigation is kept free and the book is fitted above it', () => {
  for (const stage of [{ width: 320, height: 560 }, { width: 390, height: 700 }, { width: 600, height: 400 }, { width: 900, height: 600 }]) {
    const placed = ctaPlacement(stage, true)
    assert.equal(placed.placement, 'below-nav')
    assert.equal(placed.navInset, CTA_STRIP_PX)
    assert.equal(placed.stage.height, stage.height - CTA_STRIP_PX)
    const withButton = fitBook(placed.stage, PORTRAIT)
    const without = fitBook(stage, PORTRAIT)
    assert.ok(withButton.height <= without.height)
    // The book, the navigation and the strip together fit inside the real stage.
    assert.ok(withButton.height + 88 + CTA_STRIP_PX <= stage.height, JSON.stringify(stage))
  }
})
