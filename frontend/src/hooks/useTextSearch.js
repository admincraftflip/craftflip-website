import { useCallback, useEffect, useState } from 'react'
import { SEARCH_DEBOUNCE_MS, searchErrorMessage, searchResponseOf, searchableQuery } from '../utils/textSearch'

const IDLE = { state: 'idle', query: null, response: null, message: null }

// The reader's text search (October 2026), kept by FlipbookReader so closing and reopening the
// panel keeps the query, the results and the selected result. searchText(query, signal) is the
// page's own request (owner or public API) and resolves with the response data. A search runs a
// moment after typing stops; a newer one cancels the one still in flight. result belongs to the
// query in result.query: while it differs from query, a search is pending.
export function useTextSearch(searchText, pageCount) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(IDLE)
  const [selection, setSelection] = useState({ query: null, index: -1 })
  const [retryKey, setRetryKey] = useState(0)
  const query = searchText ? searchableQuery(text) : null

  useEffect(() => {
    if (!query) return undefined
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await searchText(query, controller.signal)
        if (!controller.signal.aborted) setResult({ state: 'done', query, response: searchResponseOf(data, pageCount), message: null })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ state: 'failed', query, response: null, message: searchErrorMessage(error) })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchText, pageCount, retryKey])

  // Try again after a failure or while the text is being prepared: the shown result is dropped,
  // so the panel says it is searching.
  const retry = useCallback(() => {
    setResult(IDLE)
    setRetryKey((key) => key + 1)
  }, [])
  const setSelected = useCallback((index) => setSelection({ query, index }), [query])

  return { text, setText, query, result, selected: selection.query === query ? selection.index : -1, setSelected, retry }
}
