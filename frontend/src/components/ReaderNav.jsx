import { useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Maximize, Minimize, TableOfContents, ZoomIn, ZoomOut } from 'lucide-react'
import { ZOOM_LEVELS, parsePageInput } from '../utils/readerControls'

const NAV_PADDING_BOTTOM_PX = 16

function ToolButton({ label, onClick, disabled, pressed, color, children, wide = false }) {
  return (
    <button
      type="button"
      // 36px with a mouse, 44px on touch screens (coarse pointer) for comfortable tapping.
      className={`btn btn-ghost btn-sm h-9 min-h-9 rounded-full text-stone-700 disabled:bg-transparent [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-h-11 ${
        wide ? 'min-w-12 px-3 text-xs font-medium' : 'w-9 px-0 [@media(pointer:coarse)]:w-11'
      } ${pressed ? 'bg-stone-900/10' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      style={color ? { color } : undefined}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-stone-300" aria-hidden="true"></span>
}

// The page box: shows the pages on screen ("4–5 / 20"). Focusing it lets the reader type a page
// number; Enter goes there, Escape or leaving the box keeps the current page.
function PageBox({ label, firstPage, pageCount, onGoToPage }) {
  const [draft, setDraft] = useState(null)
  const [invalid, setInvalid] = useState(false)
  const editing = draft !== null
  const text = editing ? draft : label
  // Wide enough for its text ("100–101" in a long book), never narrower than a 3-digit number.
  const width = `${Math.max(3, text.length) + 1.5}ch`

  function submit(event) {
    event.preventDefault()
    const pageNumber = parsePageInput(draft, pageCount)
    if (pageNumber === null) return setInvalid(true)
    onGoToPage(pageNumber)
    setDraft(null)
    setInvalid(false)
    event.target.querySelector('input')?.blur()
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1 px-1 text-sm tabular-nums text-stone-600">
      <input
        className={`h-8 rounded-md border bg-transparent px-1 text-center text-sm tabular-nums text-stone-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-stone-400 ${invalid ? 'border-error' : 'border-transparent hover:border-stone-300'}`}
        style={{ width }}
        value={text}
        inputMode="numeric"
        enterKeyHint="go"
        aria-label={`Page number, 1 to ${pageCount}. Type a page and press Enter to go there.`}
        aria-invalid={invalid}
        title={`Go to a page (1–${pageCount})`}
        onFocus={(event) => {
          setDraft(String(firstPage))
          requestAnimationFrame(() => event.target.select())
        }}
        onChange={(event) => {
          setDraft(event.target.value.replace(/\D/g, '').slice(0, 4))
          setInvalid(false)
        }}
        onBlur={() => {
          setDraft(null)
          setInvalid(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.blur()
        }}
      />
      <span className="whitespace-nowrap text-stone-400">/ {pageCount}</span>
    </form>
  )
}

// The reader toolbar, shared by every viewing style: the table of contents (only when the flipbook
// has one), thumbnails, previous and next, the page box, zoom and fullscreen, on one compact bar
// centred below the book. nav comes from the viewing style
// (its own page model); controls from FlipbookReader (zoom, thumbnail panel, fullscreen, and the
// mode that says which controls fit). color: the flipbook's button colour for the arrows. tone:
// set when a background is painted behind the reader. navInset: extra room kept below for the
// floating call to action on narrow screens.
export default function ReaderNav({ nav, controls, color, tone = null, navInset = 0 }) {
  const { label, firstPage, pageCount, onPrevious, onNext, atStart, atEnd, onGoToPage } = nav
  const { mode, zoom, onZoomIn, onZoomOut, onFit, thumbnailsOpen, onToggleThumbnails, contentsOpen, onToggleContents, fullscreen } = controls
  const zoomed = zoom > 1
  const maxZoom = zoom >= ZOOM_LEVELS.at(-1)
  // On the narrowest stages the Contents button takes the fullscreen button's place, so the bar
  // still fits 320px with touch-sized buttons.
  const showFullscreen = fullscreen.supported && !(mode === 'minimal' && onToggleContents)

  return (
    <nav
      className="relative z-10 flex items-center justify-center px-2 pt-3"
      // With the button's strip below, the button keeps the safe-area distance; otherwise the bar does.
      style={{ paddingBottom: navInset ? `${NAV_PADDING_BOTTOM_PX + navInset}px` : `calc(${NAV_PADDING_BOTTOM_PX}px + env(safe-area-inset-bottom, 0px))` }}
      aria-label="Reader controls"
      data-toolbar-mode={mode}
    >
      <div className={`flex max-w-full items-center gap-0.5 rounded-full p-1 ${tone ? 'bg-white/90 shadow-sm backdrop-blur-sm' : 'bg-white/70 ring-1 ring-stone-200'}`}>
        {onToggleContents && (
          <ToolButton label={contentsOpen ? 'Close contents' : 'Contents'} onClick={onToggleContents} pressed={contentsOpen}>
            <TableOfContents size={17} aria-hidden="true" />
          </ToolButton>
        )}
        <ToolButton label={thumbnailsOpen ? 'Close page overview' : 'Show all pages'} onClick={onToggleThumbnails} pressed={thumbnailsOpen}>
          <LayoutGrid size={17} aria-hidden="true" />
        </ToolButton>
        <Divider />
        <ToolButton label="Previous page" onClick={onPrevious} disabled={atStart} color={color}>
          <ChevronLeft size={20} aria-hidden="true" />
        </ToolButton>
        <PageBox label={label} firstPage={firstPage} pageCount={pageCount} onGoToPage={onGoToPage} />
        <ToolButton label="Next page" onClick={onNext} disabled={atEnd} color={color}>
          <ChevronRight size={20} aria-hidden="true" />
        </ToolButton>
        {mode === 'full' && (
          <>
            <Divider />
            <ToolButton label="Zoom out" onClick={onZoomOut} disabled={!zoomed}>
              <ZoomOut size={17} aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Fit page to screen" onClick={onFit} disabled={!zoomed} wide>
              {zoomed ? `${Math.round(zoom * 100)}%` : 'Fit'}
            </ToolButton>
            <ToolButton label="Zoom in" onClick={onZoomIn} disabled={maxZoom}>
              <ZoomIn size={17} aria-hidden="true" />
            </ToolButton>
          </>
        )}
        {mode === 'compact' &&
          (zoomed ? (
            <ToolButton label="Fit page to screen" onClick={onFit} wide>
              Fit
            </ToolButton>
          ) : (
            <ToolButton label="Zoom in" onClick={onZoomIn}>
              <ZoomIn size={17} aria-hidden="true" />
            </ToolButton>
          ))}
        {showFullscreen && (
          <>
            {mode === 'full' && <Divider />}
            <ToolButton label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'} onClick={fullscreen.toggle} pressed={fullscreen.active}>
              {fullscreen.active ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
            </ToolButton>
          </>
        )}
      </div>
    </nav>
  )
}
