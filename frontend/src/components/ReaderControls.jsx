import { useEffect } from 'react'
import ReaderNav from './ReaderNav'
import ThumbnailPanel from './ThumbnailPanel'

// Everything a viewing style shows besides the book: the toolbar and, when open, the page
// overview. Each style passes its own page model as nav ({ label, firstPage, visiblePages,
// pageCount, atStart, atEnd, onPrevious, onNext, onGoToPage }); controls come from FlipbookReader.
// controls.onPagesShown, when given, hears the pages on screen after every move, but not while
// the page overview covers them.
export default function ReaderControls({ nav, controls, pages, color, tone, navInset }) {
  const { onPagesShown, thumbnailsOpen } = controls
  const shownKey = nav.visiblePages.join(',')
  useEffect(() => {
    if (onPagesShown && !thumbnailsOpen) onPagesShown(shownKey.split(',').map(Number))
  }, [onPagesShown, thumbnailsOpen, shownKey])

  function select(pageNumber) {
    nav.onGoToPage(pageNumber)
    controls.onCloseThumbnails()
  }

  return (
    <>
      <ReaderNav nav={nav} controls={controls} color={color} tone={tone} navInset={navInset} />
      {controls.thumbnailsOpen && (
        <ThumbnailPanel
          pages={pages}
          pageStore={controls.pageStore}
          thumbnails={controls.thumbnails}
          visiblePages={nav.visiblePages}
          onSelect={select}
          onClose={controls.onCloseThumbnails}
        />
      )}
    </>
  )
}
