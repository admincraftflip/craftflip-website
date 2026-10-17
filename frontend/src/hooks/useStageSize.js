import { useEffect, useState } from 'react'

const RESIZE_SETTLE_MS = 150

// Size of the viewer's stage element, re-measured once a resize settles.
export function useStageSize(stageRef) {
  const [size, setSize] = useState(null)

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    let timer
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(measure, RESIZE_SETTLE_MS)
    })
    measure()
    observer.observe(element)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [stageRef])

  return size
}
