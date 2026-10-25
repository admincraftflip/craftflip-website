import { useCallback, useState } from 'react'
import { usePageImageStore } from '../hooks/usePageImages'
import { useFullscreen, useThumbnailStore } from '../hooks/useReaderControls'
import PageFlipReader from './readers/PageFlipReader'
import SlideReader from './readers/SlideReader'
import ReaderCta from './ReaderCta'
import { PAGE_FLIP_SETTINGS, resolveViewerStyle } from '../utils/viewerStyles'
import { ctaPlacement } from '../utils/bookLayout'
import { contentsPanelLayout, toolbarButtons, zoomIn, zoomOut } from '../utils/readerControls'
import { useTextSearch } from '../hooks/useTextSearch'

// Shared by the private viewer (/flipbooks/:id) and the public viewer (/view/:slug). It never
// talks to the API itself: each page passes loadPage, so this file has no Firebase or auth code.
// The page-image store lives here, so switching style keeps the images already loaded.

export function ViewerMessage({ title, message, action }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="status">
      {title && <h1 className="text-lg font-semibold text-stone-800">{title}</h1>}
      <p className="max-w-sm text-sm text-stone-600">{message}</p>
      {action}
    </div>
  )
}

// loadPage(pageNumber, signal, size) resolves to a page image as a Blob; size "thumb" asks for the
// small preview used by the page overview. It must be stable (useCallback).
// viewerStyle is one of the four style ids; anything else shows Luxury Flip.
// controlColor: the primary brand colour for the navigation arrows and the call to action, or undefined.
// cta: the button to show ({ label, url } from ctaToShow), or null. It floats at the bottom right
// of the stage in every style, and the book is fitted so the button never covers it.
// contents: the table of contents ({ title, page } in page order, from readerOf); the toolbar shows
// its button only when there is at least one section.
// searchText(query, signal): the page's search request (text search, October 2026), resolving with
// the response data; search: "ready" or "preparing" (searchAvailability), or null for no search.
// tone: "light" or "dark" when a background is set behind the pages (null for the default).
// fullscreenRef: the reader stage element, which the toolbar's fullscreen button enlarges.
// onPagesShown(pages): called with the pages on screen after each move (public analytics, Milestone 10).
export default function FlipbookReader({ pages, loadPage, stage, viewerStyle, controlColor, cta = null, contents = [], searchText = null, search = null, tone = null, fullscreenRef, onPagesShown }) {
  const store = usePageImageStore(loadPage, pages.length)
  const style = resolveViewerStyle(viewerStyle)
  const fullscreen = useFullscreen(fullscreenRef)
  // Which toolbar controls fit this stage (utils/readerControls.js).
  const buttons = toolbarButtons(stage.width, {
    hasContents: contents.length > 0,
    hasSearch: Boolean(searchText && search),
    pageCount: pages.length,
    fullscreenSupported: fullscreen.supported,
  })
  const layout = ctaPlacement(stage, Boolean(cta), { hasContents: buttons.contents, hasSearch: buttons.search })

  // The toolbar state is shared by all styles: switching style keeps the zoom and the previews.
  const [zoom, setZoom] = useState(1)
  // At most one panel at a time: "thumbnails" (the page overview), "contents", "search" or null.
  const [panel, setPanel] = useState(null)
  const [thumbnailsUsed, setThumbnailsUsed] = useState(false)
  const thumbnails = useThumbnailStore(loadPage, thumbnailsUsed)
  const closeThumbnails = useCallback(() => setPanel((open) => (open === 'thumbnails' ? null : open)), [])
  const closeContents = useCallback(() => setPanel((open) => (open === 'contents' ? null : open)), [])
  const closeSearch = useCallback(() => setPanel((open) => (open === 'search' ? null : open)), [])
  const thumbnailsOpen = panel === 'thumbnails'
  const contentsOpen = buttons.contents && panel === 'contents'
  const searchOpen = buttons.search && panel === 'search'
  const textSearch = useTextSearch(buttons.search ? searchText : null, pages.length)
  const panelLayout = contentsPanelLayout(stage.width)

  const controls = {
    mode: buttons.mode,
    buttons,
    zoom,
    onZoomIn: () => setZoom(zoomIn),
    onZoomOut: () => setZoom(zoomOut),
    onFit: () => setZoom(1),
    thumbnailsOpen,
    onToggleThumbnails: () => {
      setThumbnailsUsed(true)
      setPanel((open) => (open === 'thumbnails' ? null : 'thumbnails'))
    },
    onCloseThumbnails: closeThumbnails,
    contents,
    contentsOpen,
    contentsLayout: panelLayout,
    onToggleContents: buttons.contents ? () => setPanel((open) => (open === 'contents' ? null : 'contents')) : null,
    onCloseContents: closeContents,
    search: textSearch,
    searchAvailability: search,
    searchOpen,
    searchLayout: panelLayout,
    onToggleSearch: buttons.search ? () => setPanel((open) => (open === 'search' ? null : 'search')) : null,
    onCloseSearch: closeSearch,
    thumbnails,
    pageStore: store,
    fullscreen,
    onPagesShown,
  }
  const shared = { pages, store, stage: layout.stage, controlColor, navInset: layout.navInset, tone, controls }

  // Each style mounts fresh (key), starting at the cover.
  let reader
  if (style === 'clean-swipe') reader = <SlideReader key={style} mode="swipe" {...shared} />
  else if (style === 'editorial') reader = <SlideReader key={style} mode="fade" {...shared} />
  else reader = <PageFlipReader key={style} settings={PAGE_FLIP_SETTINGS[style]} {...shared} />

  return (
    <>
      {reader}
      {cta && !thumbnailsOpen && !contentsOpen && !searchOpen && <ReaderCta cta={cta} color={controlColor} placement={layout.placement} />}
    </>
  )
}
