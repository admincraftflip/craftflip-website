import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createThumbnailStore, fullscreenApi } from '../utils/readerControls'

// Fullscreen for the reader stage (targetRef): its content (background, book, toolbar and button)
// fills the screen. supported is false where the browser or the embedding page does not allow it.
export function useFullscreen(targetRef) {
  const api = useMemo(() => fullscreenApi(), [])
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!api.supported) return
    const update = () => setActive(Boolean(targetRef.current) && api.element() === targetRef.current)
    api.changeEvents.forEach((name) => document.addEventListener(name, update))
    return () => api.changeEvents.forEach((name) => document.removeEventListener(name, update))
  }, [api, targetRef])

  const toggle = useCallback(async () => {
    try {
      if (api.element()) await api.exit()
      else if (targetRef.current) await api.enter(targetRef.current)
    } catch {
      // Refused (for example without a user gesture): the reader simply stays as it is.
    }
  }, [api, targetRef])

  return { supported: api.supported, active, toggle }
}

// The previews for the thumbnail panel, created when the panel is first opened and freed with the
// reader. loadPage(pageNumber, signal, size) is the reader's own page loader (private or public API).
export function useThumbnailStore(loadPage, enabled) {
  const store = useMemo(() => (enabled ? createThumbnailStore((pageNumber, signal) => loadPage(pageNumber, signal, 'thumb')) : null), [loadPage, enabled])
  useEffect(() => () => store?.close(), [store])
  return store
}

const NO_ENTRY = () => undefined
const NO_SUBSCRIPTION = () => () => {}

export function useThumbnail(store, pageNumber) {
  return useSyncExternalStore(store ? store.subscribe : NO_SUBSCRIPTION, store ? () => store.get(pageNumber) : NO_ENTRY)
}
