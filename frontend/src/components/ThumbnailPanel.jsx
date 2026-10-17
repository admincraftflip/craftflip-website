import { useEffect, useRef } from 'react'
import { ImageOff, X } from 'lucide-react'
import { usePageImage } from '../hooks/usePageImages'
import { useThumbnail } from '../hooks/useReaderControls'

// One page in the overview. Its preview is requested only while it is (nearly) in view, so a long
// book does not load every page. A full page the reader has already loaded is used as it is.
function Thumbnail({ page, thumbnails, pages, current, onSelect }) {
  const ref = useRef(null)
  const preview = useThumbnail(thumbnails, page.pageNumber)
  const fullPage = usePageImage(pages, page.pageNumber)
  const src = fullPage?.status === 'loaded' ? fullPage.url : preview?.status === 'loaded' ? preview.url : null

  useEffect(() => {
    const element = ref.current
    if (!element || !thumbnails || fullPage?.status === 'loaded') return
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? thumbnails.request(page.pageNumber) : thumbnails.cancel(page.pageNumber)),
      { root: element.closest('[data-thumbnail-grid]'), rootMargin: '200px 0px' }
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      thumbnails.cancel(page.pageNumber)
    }
  }, [thumbnails, page.pageNumber, fullPage?.status])

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onSelect(page.pageNumber)}
        aria-current={current ? 'page' : undefined}
        aria-label={`Go to page ${page.pageNumber}${current ? ' (on screen)' : ''}`}
        className={`group flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs tabular-nums transition-colors ${
          current ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/70'
        }`}
      >
        <span
          className={`relative flex w-full items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ${current ? 'ring-white/60' : 'ring-stone-200'}`}
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        >
          {src ? (
            <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : preview?.status === 'failed' ? (
            <span className="flex flex-col items-center gap-1 px-1 text-center text-[10px] text-stone-400">
              <ImageOff size={16} aria-hidden="true" />
              Preview unavailable
            </span>
          ) : (
            <span className="h-full w-full animate-pulse bg-stone-100" aria-hidden="true"></span>
          )}
        </span>
        {page.pageNumber}
      </button>
    </li>
  )
}

// The page overview: every page as a small preview with its number, the pages on screen marked.
// Choosing one goes there and closes the overview. It covers the reader stage (not the whole
// page), so it works the same in the owner preview, the public viewer, embeds and fullscreen.
// Escape or the close button closes it.
export default function ThumbnailPanel({ pages, pageStore, thumbnails, visiblePages, onSelect, onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    const panel = panelRef.current
    // Open at the current page, and give keyboard users a starting point.
    const current = panel?.querySelector('[aria-current="page"]')
    current?.scrollIntoView({ block: 'center' })
    ;(current ?? panel?.querySelector('button'))?.focus({ preventScroll: true })
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-stone-100/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="All pages" ref={panelRef}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-sm font-medium text-stone-800">All pages</h2>
        <button type="button" className="btn btn-ghost btn-circle h-11 min-h-11 w-11 text-stone-700" onClick={onClose} aria-label="Close page overview" title="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]" data-thumbnail-grid>
        <ol className="mx-auto grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] sm:gap-3">
          {pages.map((page) => (
            <Thumbnail key={page.pageNumber} page={page} thumbnails={thumbnails} pages={pageStore} current={visiblePages.includes(page.pageNumber)} onSelect={onSelect} />
          ))}
        </ol>
      </div>
    </div>
  )
}
