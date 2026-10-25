import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { currentSectionIndex } from '../utils/readerControls'

// The table of contents: the owner's sections with their first page, the section being read
// marked. Choosing one goes to its page and closes the panel. layout "side" opens it as a column
// at the left of the reader stage, beside the book; "cover" fills the stage (narrow screens), like
// the page overview. Escape or the close button closes it; focus moves into it on opening and
// back to whatever had it (the toolbar button) on closing.
// The side panel stops above the toolbar (80px tall with touch-sized buttons, plus the room kept
// for the floating button), so the toolbar stays usable while it is open.
const TOOLBAR_HEIGHT_PX = 80

export default function ContentsPanel({ contents, visiblePages, layout, navInset = 0, onSelect, onClose }) {
  const panelRef = useRef(null)
  const current = currentSectionIndex(contents, visiblePages)

  useEffect(() => {
    const panel = panelRef.current
    const opener = document.activeElement
    const marked = panel?.querySelector('[aria-current="location"]')
    marked?.scrollIntoView({ block: 'nearest' })
    ;(marked ?? panel?.querySelector('li button'))?.focus({ preventScroll: true })
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [onClose])

  const side = layout === 'side'
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={side ? 'false' : 'true'}
      aria-labelledby="reader-contents-title"
      className={`absolute z-20 flex flex-col bg-stone-100/95 backdrop-blur-sm ${
        side ? 'left-0 top-0 w-80 max-w-[85%] rounded-br-xl shadow-xl ring-1 ring-stone-200' : 'inset-0'
      }`}
      style={side ? { bottom: navInset ? `${TOOLBAR_HEIGHT_PX + navInset}px` : `calc(${TOOLBAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` } : undefined}
    >
      <div className="flex items-center justify-between pb-2 pl-4 pr-2 pt-3">
        <h2 id="reader-contents-title" className="text-sm font-medium text-stone-800">
          Contents
        </h2>
        <button type="button" className="btn btn-ghost btn-circle h-11 min-h-11 w-11 text-stone-700" onClick={onClose} aria-label="Close contents" title="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-label="Sections">
        <ol className={`flex flex-col gap-0.5 ${side ? '' : 'mx-auto max-w-xl'}`}>
          {contents.map((entry, index) => {
            const isCurrent = index === current
            return (
              <li key={`${entry.page}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.page)}
                  aria-current={isCurrent ? 'location' : undefined}
                  className={`flex min-h-11 w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    isCurrent ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200/70'
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words">{entry.title}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${isCurrent ? 'text-white/70' : 'text-stone-500'}`}>
                    <span className="sr-only">Page </span>
                    {entry.page}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    </div>
  )
}
