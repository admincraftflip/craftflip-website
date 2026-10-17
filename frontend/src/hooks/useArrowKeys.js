import { useEffect } from 'react'

// Left and right arrow keys turn pages in every viewing style, except while typing (the toolbar's
// page box, the Customize dialog's fields), where they move the caret.
export function useArrowKeys(onPrevious, onNext) {
  useEffect(() => {
    function handleKey(event) {
      const target = event.target
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return
      if (event.key === 'ArrowLeft') onPrevious()
      if (event.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onPrevious, onNext])
}
