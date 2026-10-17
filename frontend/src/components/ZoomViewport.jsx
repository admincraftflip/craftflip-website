import { useLayoutEffect, useRef } from 'react'

// The area that holds the book in every viewing style. At fit (zoom 1) it centres the book as
// before. When zoomed, the book is laid out larger (never scaled with a CSS transform, so the
// page-turn engine keeps correct pointer positions) and this area scrolls; each zoom step keeps
// the view centred. m-auto centres the book while it fits and lets it scroll from its edges when
// it does not (plain flex centring would cut off the top and left).
export default function ZoomViewport({ zoom, children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2
  }, [zoom])

  return (
    <div ref={ref} className={`flex min-h-0 flex-1 ${zoom > 1 ? 'overflow-auto overscroll-contain' : ''}`} data-reader-viewport data-zoom={zoom}>
      <div className="m-auto">{children}</div>
    </div>
  )
}
