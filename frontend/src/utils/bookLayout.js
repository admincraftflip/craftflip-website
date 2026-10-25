// Layout rules for the flipbook viewer, kept free of React so they can be tested on their own.
// Page indexes are react-pageflip's: 0-based, and on a spread the index of the left page.

// Two pages side by side only when the stage is wide enough to show them at a readable size.
const MIN_SPREAD_STAGE_WIDTH = 640
// Room kept around the book inside the stage: side gutters, and the navigation bar below it.
const STAGE_GUTTER_X = 32
const STAGE_RESERVED_Y = 88
const MIN_PAGE_SIDE = 1

// Largest page size that fits the stage, as a two-page spread or a single page. allowSpread false
// always gives a single page (Clean Swipe).
export function fitBook(stageSize, aspectRatio, { allowSpread = true } = {}) {
  const stage = { width: stageSize.width - STAGE_GUTTER_X, height: stageSize.height - STAGE_RESERVED_Y }
  const spreadHeight = Math.min(stage.height, stage.width / 2 / aspectRatio)
  const singleHeight = Math.min(stage.height, stage.width / aspectRatio)
  const spread = allowSpread && stage.width >= MIN_SPREAD_STAGE_WIDTH && spreadHeight >= singleHeight * 0.75
  const height = Math.max(MIN_PAGE_SIDE, Math.floor(spread ? spreadHeight : singleHeight))
  return { spread, width: Math.max(MIN_PAGE_SIDE, Math.floor(height * aspectRatio)), height }
}

// Visible pages for the indicator: the cover and last page alone, inner pages in pairs on a spread.
export function visiblePagesLabel(pageIndex, pageCount, spread) {
  const first = pageIndex + 1
  if (!spread || first === 1 || first >= pageCount) return `${first}`
  const left = first % 2 === 0 ? first : first - 1
  return `${left}–${left + 1}`
}

// With the cover shown alone, spreads start at odd indexes, so the last spread can end the book.
export function isAtLastPage(pageIndex, pageCount, spread) {
  const lastIndex = pageCount - 1
  if (pageIndex >= lastIndex) return true
  return spread && pageIndex === lastIndex - 1 && pageIndex % 2 === 1
}

// What the CSS-based styles (Clean Swipe, Editorial) show at each step, as page numbers. On a
// spread they follow the same book layout as the page-flip styles: the cover alone, then pairs
// (2-3, 4-5, ...), and the last page alone when the page count is even. Single mode shows one page per step.
export function buildViews(pageCount, spread) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
  if (!spread || pageCount <= 2) return pageNumbers.map((pageNumber) => [pageNumber])
  const views = [[1]]
  for (let left = 2; left <= pageCount; left += 2) {
    views.push(left + 1 <= pageCount ? [left, left + 1] : [left])
  }
  return views
}

export function viewLabel(view) {
  return view.length === 2 ? `${view[0]}–${view[1]}` : `${view[0]}`
}

// The floating call-to-action button sits at the bottom right of the stage. On a wide stage there
// is room for it beside the centred reader toolbar (at most TOOLBAR_MAX_WIDTH_PX wide). On a
// narrower one (laptops with a narrow window, tablets, phones, small embeds) a strip is kept free
// below the toolbar for it, and the book is fitted into the height that is left,
// so the button never covers pages, page corners or the navigation.
export const CTA_STRIP_PX = 44
export const TOOLBAR_MAX_WIDTH_PX = 440
export const CTA_MAX_WIDTH_PX = 240
// Half the toolbar, the button and two 12px margins plus a gap fit in half the stage.
export const CTA_BESIDE_NAV_MIN_WIDTH = 980
// The toolbar's Contents button (44px on touch screens plus its gap), shown only for flipbooks
// with a table of contents; the button then needs that much more room to sit beside the toolbar.
export const CONTENTS_BUTTON_PX = 46

export function ctaPlacement(stage, hasCta, { hasContents = false } = {}) {
  if (!hasCta) return { stage, navInset: 0, placement: null }
  const besideMinWidth = CTA_BESIDE_NAV_MIN_WIDTH + (hasContents ? CONTENTS_BUTTON_PX : 0)
  if (stage.width >= besideMinWidth) return { stage, navInset: 0, placement: 'beside-nav' }
  return { stage: { width: stage.width, height: Math.max(0, stage.height - CTA_STRIP_PX) }, navInset: CTA_STRIP_PX, placement: 'below-nav' }
}
