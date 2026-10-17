import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import FlipbookPage from '../FlipbookPage'
import ReaderControls from '../ReaderControls'
import ZoomViewport from '../ZoomViewport'
import { useArrowKeys } from '../../hooks/useArrowKeys'
import { fitBook, isAtLastPage, visiblePagesLabel } from '../../utils/bookLayout'
import { pagesOnScreen, zoomLayout } from '../../utils/readerControls'

// Luxury Flip and Classic Book: realistic page turns with react-pageflip. settings come from
// PAGE_FLIP_SETTINGS; a bound book (Classic Book) also gets a spine shadow and stacked page edges.
// Zooming lays the book out larger (the engine remounts at the new size on the same page); while
// zoomed, dragging pans the view instead of turning pages, and the toolbar or arrow keys turn them.
export default function PageFlipReader({ pages, store, stage, settings, controlColor, navInset, tone, controls }) {
  const bookRef = useRef(null)
  const [pageIndex, setPageIndex] = useState(0)
  const firstPage = pages[0]
  const { zoom } = controls
  const layout = zoomLayout(fitBook(stage, firstPage.width / firstPage.height), zoom)

  useEffect(() => {
    store.setFocus(pageIndex + 1)
  }, [store, pageIndex])

  const flipPrev = useCallback(() => bookRef.current?.pageFlip()?.flipPrev(), [])
  const flipNext = useCallback(() => bookRef.current?.pageFlip()?.flipNext(), [])
  // A direct jump (page box, overview) shows the spread holding that page at once; the engine then
  // reports the new position through onFlip like any turn.
  const goToPage = useCallback((pageNumber) => bookRef.current?.pageFlip()?.turnToPage(pageNumber - 1), [])
  useArrowKeys(flipPrev, flipNext)

  // react-pageflip reads its pages once; they are rebuilt only when the book remounts on resize.
  const pageElements = useMemo(
    () => pages.map((page) => <FlipbookPage key={page.pageNumber} store={store} pageNumber={page.pageNumber} />),
    [store, pages]
  )

  const atStart = pageIndex === 0
  const atEnd = isAtLastPage(pageIndex, pages.length, layout.spread)
  // Two pages are open side by side (not the cover or a last page shown alone).
  const spreadOpen = layout.spread && !atStart && !(pageIndex >= pages.length - 1)
  const bookWidth = layout.spread ? layout.width * 2 : layout.width

  return (
    <>
      <ZoomViewport zoom={zoom}>
        <div
          className="relative"
          style={{
            width: bookWidth,
            height: layout.height,
            // Page edges below the open book: two thin offset layers read as a stack of pages.
            boxShadow: settings.bound && spreadOpen ? '0 3px 0 -1px #ece7df, 0 6px 0 -2px #ddd6ca, 0 22px 40px -12px rgba(41, 37, 36, 0.45)' : undefined,
          }}
        >
          <HTMLFlipBook
            key={`${layout.spread ? 'spread' : 'single'}-${layout.width}x${layout.height}`}
            ref={bookRef}
            className="drop-shadow-xl"
            style={{ width: bookWidth, height: layout.height }}
            size="fixed"
            width={layout.width}
            height={layout.height}
            minWidth={layout.width}
            maxWidth={layout.width}
            minHeight={layout.height}
            maxHeight={layout.height}
            startPage={pageIndex}
            usePortrait
            showCover
            drawShadow
            flippingTime={settings.flippingTime}
            maxShadowOpacity={settings.maxShadowOpacity}
            showPageCorners
            mobileScrollSupport
            useMouseEvents={zoom === 1}
            renderOnlyPageLengthChange
            onFlip={(event) => setPageIndex(event.data)}
          >
            {pageElements}
          </HTMLFlipBook>
          {settings.bound && spreadOpen && (
            // The spine: a soft fold shadow down the middle of the open spread.
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2"
              style={{ background: 'linear-gradient(to right, transparent, rgba(41, 37, 36, 0.22) 48%, rgba(41, 37, 36, 0.3) 50%, rgba(41, 37, 36, 0.22) 52%, transparent)' }}
              aria-hidden="true"
            ></div>
          )}
        </div>
      </ZoomViewport>

      <ReaderControls
        nav={{
          label: visiblePagesLabel(pageIndex, pages.length, layout.spread),
          firstPage: pageIndex + 1,
          visiblePages: pagesOnScreen(pageIndex, pages.length, layout.spread),
          pageCount: pages.length,
          onPrevious: flipPrev,
          onNext: flipNext,
          onGoToPage: goToPage,
          atStart,
          atEnd,
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
