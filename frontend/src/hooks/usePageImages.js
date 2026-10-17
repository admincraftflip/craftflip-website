import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createPageImageStore } from '../utils/pageImageStore'

export function usePageImageStore(loadPage, pageCount) {
  const store = useMemo(() => createPageImageStore(loadPage, pageCount), [loadPage, pageCount])

  useEffect(() => {
    store.open()
    return () => store.close()
  }, [store])

  return store
}

export function usePageImage(store, pageNumber) {
  return useSyncExternalStore(store.subscribe, () => store.get(pageNumber))
}
