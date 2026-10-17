import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FlipbookPage from '../FlipbookPage'
import ReaderControls from '../ReaderControls'
import ZoomViewport from '../ZoomViewport'
import { useArrowKeys } from '../../hooks/useArrowKeys'
import { buildViews, fitBook, viewLabel } from '../../utils/bookLayout'
import { zoomLayout } from '../../utils/readerControls'

const SWIPE_THRESHOLD_PX = 40
const TAP_MAX_MOVE_PX = 6
// Editorial keeps extra white space around the pages and room for page numbers below them.
const EDITORIAL_STAGE_SCALE = 0.88
const EDITORIAL_CAPTION_PX = 28

// Clean Swipe (mode "swipe"): one page at a time on a horizontal track, swipe, tap a side, arrows.
// Editorial (mode "fade"): spreads on wide screens, single pages on narrow ones, each step fading in.
// Pages are tracked by the first page number on screen, so a resize between spread and single
// layouts keeps the reader on the same page. Zooming lays the pages out larger; while zoomed,
// swipes and taps pan the view instead of turning pages (the toolbar and arrow keys still do).
export default function SlideReader({ pages, store, stage, mode, controlColor, navInset, tone, controls }) {
  const isFade = mode === 'fade'
  const [currentPage, setCurrentPage] = useState(1)
  const pointerStart = useRef(null)
  const firstPage = pages[0]
  const ratio = firstPage.width / firstPage.height

  const { zoom } = controls
  const zoomed = zoom > 1
  const fitted = isFade
    ? fitBook({ width: stage.width * EDITORIAL_STAGE_SCALE, height: stage.height - EDITORIAL_CAPTION_PX }, ratio)
    : fitBook(stage, ratio, { allowSpread: false })
  const layout = zoomLayout(fitted, zoom)
  const views = useMemo(() => buildViews(pages.length, layout.spread), [pages.length, layout.spread])
  const viewIndex = Math.max(0, views.findIndex((view) => view.includes(currentPage)))
  const view = views[viewIndex]

  useEffect(() => {
    store.setFocus(view[0])
  }, [store, view])

  const goTo = useCallback(
    (index) => {
      const next = views[Math.min(Math.max(index, 0), views.length - 1)]
      setCurrentPage(next[0])
    },
    [views]
  )
  const goPrevious = useCallback(() => goTo(viewIndex - 1), [goTo, viewIndex])
  const goNext = useCallback(() => goTo(viewIndex + 1), [goTo, viewIndex])
  // A direct jump (page box, overview): the view holding that page, on a spread or single pages.
  const goToPage = useCallback((pageNumber) => setCurrentPage(Math.min(Math.max(pageNumber, 1), pages.length)), [pages.length])
  useArrowKeys(goPrevious, goNext)

  // A horizontal swipe turns the page; a tap on the left or right half does the same.
  function handlePointerDown(event) {
    if (zoomed) return
    pointerStart.current = event.clientX
  }
  function handlePointerUp(event) {
    if (pointerStart.current === null) return
    const moved = event.clientX - pointerStart.current
    pointerStart.current = null
    if (moved <= -SWIPE_THRESHOLD_PX) return goNext()
    if (moved >= SWIPE_THRESHOLD_PX) return goPrevious()
    if (Math.abs(moved) <= TAP_MAX_MOVE_PX) {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left + bounds.width / 2) goPrevious()
      else goNext()
    }
  }

  const pointerHandlers = { onPointerDown: handlePointerDown, onPointerUp: handlePointerUp, onPointerCancel: () => (pointerStart.current = null) }

  return (
    <>
      <ZoomViewport zoom={zoom}>
        {isFade ? (
          <div className={`select-none ${zoomed ? '' : 'cursor-pointer'}`} {...pointerHandlers}>
            <div key={view[0]} className="cf-fade-in flex items-start gap-px">
              {view.map((pageNumber) => (
                <figure key={pageNumber} style={{ width: layout.width }}>
                  <div className="shadow-sm" style={{ width: layout.width, height: layout.height }}>
                    <FlipbookPage store={store} pageNumber={pageNumber} />
                  </div>
                  <figcaption className={`mt-3 text-center text-[10px] tabular-nums tracking-[0.25em] ${tone === 'dark' ? 'text-white/80' : 'text-stone-400'}`}>
                    {String(pageNumber).padStart(2, '0')}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`select-none overflow-hidden shadow-lg ${zoomed ? '' : 'cursor-pointer'}`}
            style={{ width: layout.width, height: layout.height, touchAction: zoomed ? 'auto' : 'pan-y' }}
            {...pointerHandlers}
          >
            <div
              className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ width: layout.width * pages.length, transform: `translateX(${-viewIndex * layout.width}px)` }}
            >
              {pages.map((page) => (
                <div key={page.pageNumber} className="shrink-0" style={{ width: layout.width, height: layout.height }}>
                  <FlipbookPage store={store} pageNumber={page.pageNumber} />
                </div>
              ))}
            </div>
          </div>
        )}
      </ZoomViewport>

      <ReaderControls
        nav={{
          label: viewLabel(view),
          firstPage: view[0],
          visiblePages: view,
          pageCount: pages.length,
          onPrevious: goPrevious,
          onNext: goNext,
          onGoToPage: goToPage,
          atStart: viewIndex === 0,
          atEnd: viewIndex === views.length - 1,
        }}
        controls={controls}
        pages={pages}
        color={controlColor}
        tone={tone}
        navInset={navInset}
      />
    </>
  )
}
