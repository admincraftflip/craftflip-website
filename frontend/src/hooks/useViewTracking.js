import { useCallback, useEffect, useRef } from 'react'
import { createViewTracker, isOwnedHere, sendActivity, trackingAllowed, visitorIdFor } from '../utils/viewTracking'

// Reports a public visit for the owner's analytics (Milestone 10), only in the public viewer and
// embeds, once the flipbook has loaded. Returns onPagesShown(pages) for the reader. Hidden or
// closed pages send their last report; nothing here can delay or break reading.
export function useViewTracking(apiBase, slug, { active, embedded }) {
  const trackerRef = useRef(null)

  useEffect(() => {
    if (!active || !slug || !trackingAllowed() || isOwnedHere(slug)) return
    const tracker = createViewTracker({
      visitorId: visitorIdFor(),
      referrer: document.referrer,
      embedded,
      send: (report, options) => sendActivity(apiBase, slug, report, options),
    })
    trackerRef.current = tracker
    tracker.start()

    function handleVisibility() {
      if (document.visibilityState === 'hidden') tracker.leave()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', tracker.leave)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', tracker.leave)
      tracker.stop()
      trackerRef.current = null
    }
  }, [apiBase, slug, active, embedded])

  return useCallback((pages) => trackerRef.current?.show(pages), [])
}
