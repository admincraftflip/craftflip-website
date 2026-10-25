// Text search in the reader (October 2026): the rules behind the search panel, free of React so
// they can be tested. The server finds the matches (GET .../search?q=) and sends page numbers with
// short snippets; see REFERENCE.md, "Text search".

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_MAX_LENGTH = 100
// The search runs this long after typing stops.
export const SEARCH_DEBOUNCE_MS = 250

// Whether the toolbar shows a search button: "ready", "preparing" (older flipbooks whose text is
// being read; the panel says so), or null (no text, as in a scanned PDF, or not converted).
export function searchAvailability(flipbook) {
  return ['ready', 'preparing'].includes(flipbook?.search) ? flipbook.search : null
}

// What the reader typed, tidied as the server does, or null when it cannot be searched yet.
export function searchableQuery(text) {
  const query = String(text ?? '').replace(/\s+/g, ' ').trim()
  return query.length >= SEARCH_MIN_LENGTH && query.length <= SEARCH_MAX_LENGTH ? query : null
}

function isResult(result) {
  return (
    Number.isInteger(result?.page) &&
    result.page >= 1 &&
    typeof result.match === 'string' &&
    typeof result.before === 'string' &&
    typeof result.after === 'string'
  )
}

// The search response with anything unexpected left out. pageCount, when known, drops results past
// the last page.
export function searchResponseOf(data, pageCount = null) {
  const lastPage = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : Infinity
  const status = ['ready', 'preparing', 'unavailable'].includes(data?.status) ? data.status : 'unavailable'
  const results = Array.isArray(data?.results)
    ? data.results.filter((result) => isResult(result) && result.page <= lastPage).map(({ page, before, match, after }) => ({ page, before, match, after }))
    : []
  const total = Number.isInteger(data?.total) && data.total >= results.length ? data.total : results.length
  return { status, results, total, limited: data?.limited === true }
}

// The line above the results: "3 results", "1,000+ results", "No results".
export function searchSummary({ results, total, limited }) {
  if (results.length === 0) return 'No results'
  const count = `${total.toLocaleString('en-US')}${limited ? '+' : ''}`
  const shown = total > results.length ? ` (first ${results.length} shown)` : ''
  return `${count} ${total === 1 && !limited ? 'result' : 'results'}${shown}`
}

// The result after or before the selected one (step 1 or -1), wrapping around; the first or last
// when none is selected yet.
export function stepResult(selected, count, step) {
  if (count === 0) return -1
  if (selected < 0) return step > 0 ? 0 : count - 1
  return (selected + step + count) % count
}

// The message for a search that failed (rate limit, network); the server's own message when it
// sent one.
export function searchErrorMessage(error) {
  return error?.response?.data?.message ?? "Search isn't working right now. Please try again."
}
