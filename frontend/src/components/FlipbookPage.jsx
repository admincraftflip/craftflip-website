import { useCallback, useRef } from 'react'
import { usePageImage } from '../hooks/usePageImages'

// One page image, used by every viewing style. react-pageflip collects page elements through the ref it adds;
// in development, React StrictMode attaches refs twice, so each element is handed over only once.
export default function FlipbookPage({ ref, store, pageNumber }) {
  const image = usePageImage(store, pageNumber)
  const handedOver = useRef(null)

  const attach = useCallback(
    (node) => {
      if (!node || node === handedOver.current) return
      handedOver.current = node
      if (typeof ref === 'function') ref(node)
    },
    [ref]
  )

  return (
    <div ref={attach} className="h-full w-full overflow-hidden bg-white">
      {image?.status === 'loaded' ? (
        <img src={image.url} alt={`Page ${pageNumber}`} draggable={false} className="h-full w-full select-none object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-50">
          {image?.status === 'failed' ? (
            <span className="px-4 text-center text-xs text-stone-500">This page couldn't load. Turn the page to try again.</span>
          ) : (
            <span className="loading loading-ring loading-md text-stone-300" aria-label={`Loading page ${pageNumber}`}></span>
          )}
        </div>
      )}
    </div>
  )
}
