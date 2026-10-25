import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { currentSectionIndex } from '../utils/readerControls'
import { SEARCH_MIN_LENGTH, searchSummary, stepResult } from '../utils/textSearch'

// Same room as the contents panel: the side panel stops above the toolbar.
const TOOLBAR_HEIGHT_PX = 80

function StatusLine({ children }) {
  return <p className="px-4 py-2 text-sm text-stone-600">{children}</p>
}

// One result: its page and the snippet with the match highlighted (plain text, never HTML).
function ResultButton({ result, index, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-11 w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        selected ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200/70'
      }`}
    >
      <span className={`text-xs font-medium tabular-nums ${selected ? 'text-white/70' : 'text-stone-500'}`}>Page {result.page}</span>
      <span className="break-words">
        {result.before}
        <mark className={`rounded-sm px-0.5 font-medium ${selected ? 'bg-amber-300 text-stone-900' : 'bg-amber-200 text-stone-900'}`}>{result.match}</mark>
        {result.after}
      </span>
    </button>
  )
}

// The search panel (text search, October 2026): a search field, the number of matches with
// previous and next, and every result as its page and a snippet. Choosing a result (or previous
// and next) goes to its page; on narrow stages (layout "cover") the panel then closes, and opening
// it again shows the same results. onSelectResult(index, page) records and goes to a result. search comes from useTextSearch (kept by FlipbookReader).
// availability "preparing": the flipbook's text is still being read (older flipbooks). contents,
// when given (the narrowest toolbar has no Contents button), is listed while the field is empty.
// Escape or the close button closes it; focus goes to the field and back to the opener on closing.
export default function SearchPanel({ search, availability, contents = null, visiblePages, layout, navInset = 0, onSelectResult, onSelectSection, onClose }) {
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const { text, setText, query, result, selected, retry } = search
  const response = result.state === 'done' && result.query === query ? result.response : null
  const results = response?.status === 'ready' ? response.results : []
  const side = layout === 'side'

  useEffect(() => {
    const opener = document.activeElement
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [onClose])

  // Keep the selected result in view, including when it was chosen with previous and next.
  useEffect(() => {
    panelRef.current?.querySelector('[data-search-results] [aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, results.length])

  function choose(index) {
    if (index >= 0 && results[index]) onSelectResult(index, results[index].page)
  }

  function step(direction) {
    choose(stepResult(selected, results.length, direction))
  }

  function renderStatus() {
    if (!query) {
      if (availability === 'preparing') return <StatusLine>Search is being prepared for this flipbook. It can take a minute.</StatusLine>
      return text.trim() ? <StatusLine>Type at least {SEARCH_MIN_LENGTH} characters.</StatusLine> : null
    }
    if (result.state === 'failed' && result.query === query) {
      return (
        <StatusLine>
          {result.message}{' '}
          <button type="button" className="link" onClick={retry}>
            Try again
          </button>
        </StatusLine>
      )
    }
    if (!response) return <StatusLine>Searching…</StatusLine>
    if (response.status === 'preparing') {
      return (
        <StatusLine>
          Search is being prepared for this flipbook. Please try again in a minute.{' '}
          <button type="button" className="link" onClick={retry}>
            Try again
          </button>
        </StatusLine>
      )
    }
    if (response.status === 'unavailable') return <StatusLine>This flipbook has no searchable text.</StatusLine>
    return (
      <div className="flex items-center justify-between gap-2 py-1 pl-4 pr-2">
        <p className="text-sm text-stone-600">
          {searchSummary(response)}
          {selected >= 0 && results.length > 0 && <span className="sr-only">, result {selected + 1} selected</span>}
        </p>
        {results.length > 0 && (
          <div className="flex shrink-0 items-center">
            <button type="button" className="btn btn-ghost btn-circle h-11 min-h-11 w-11 text-stone-700" onClick={() => step(-1)} aria-label="Previous result" title="Previous result">
              <ChevronUp size={18} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost btn-circle h-11 min-h-11 w-11 text-stone-700" onClick={() => step(1)} aria-label="Next result" title="Next result">
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    )
  }

  const showContents = contents?.length > 0 && !text.trim()
  const currentSection = showContents ? currentSectionIndex(contents, visiblePages) : -1

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={side ? 'false' : 'true'}
      aria-label="Search this flipbook"
      className={`absolute z-20 flex flex-col bg-stone-100/95 backdrop-blur-sm ${
        side ? 'left-0 top-0 w-80 max-w-[85%] rounded-br-xl shadow-xl ring-1 ring-stone-200' : 'inset-0'
      }`}
      style={side ? { bottom: navInset ? `${TOOLBAR_HEIGHT_PX + navInset}px` : `calc(${TOOLBAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` } : undefined}
    >
      <div className={`flex w-full items-center gap-1 pb-1 pl-3 pr-2 pt-3 ${side ? '' : 'mx-auto max-w-xl'}`}>
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            step(1)
          }}
        >
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="input input-bordered h-11 w-full bg-white pl-9 text-base sm:text-sm"
            placeholder="Search this flipbook"
            aria-label="Search this flipbook"
            value={text}
            maxLength={100}
            enterKeyHint="search"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.shiftKey) {
                event.preventDefault()
                step(-1)
              }
            }}
          />
        </form>
        <button type="button" className="btn btn-ghost btn-circle h-11 min-h-11 w-11 shrink-0 text-stone-700" onClick={onClose} aria-label="Close search" title="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className={`w-full ${side ? '' : 'mx-auto max-w-xl'}`} aria-live="polite">
        {renderStatus()}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {results.length > 0 && (
          <ol className={`flex flex-col gap-0.5 ${side ? '' : 'mx-auto max-w-xl'}`} data-search-results aria-label="Results">
            {results.map((item, index) => (
              <li key={`${item.page}-${index}`}>
                <ResultButton result={item} index={index} selected={index === selected} onSelect={choose} />
              </li>
            ))}
          </ol>
        )}
        {showContents && (
          <nav className={`flex flex-col gap-0.5 ${side ? '' : 'mx-auto max-w-xl'}`} aria-label="Contents">
            <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Contents</h2>
            <ol className="flex flex-col gap-0.5">
              {contents.map((entry, index) => (
                <li key={`${entry.page}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onSelectSection(entry.page)}
                    aria-current={index === currentSection ? 'location' : undefined}
                    className={`flex min-h-11 w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      index === currentSection ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200/70'
                    }`}
                  >
                    <span className="min-w-0 flex-1 break-words">{entry.title}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${index === currentSection ? 'text-white/70' : 'text-stone-500'}`}>
                      <span className="sr-only">Page </span>
                      {entry.page}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  )
}
