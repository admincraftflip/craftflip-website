import { useEffect } from 'react'
import ReaderNav from './ReaderNav'
import ThumbnailPanel from './ThumbnailPanel'
import ContentsPanel from './ContentsPanel'

// Everything a viewing style shows besides the book: the toolbar and, when open, the page
// overview or the table of contents (never both). Each style passes its own page model as nav
// ({ label, firstPage, visiblePages, pageCount, atStart, atEnd, onPrevious, onNext, onGoToPage });
// controls come from FlipbookReader. controls.onPagesShown, when given, hears the pages on screen
// after every move, but not while a panel is open.
export default function ReaderControls({ nav, controls, pages, color, tone, navInset }) {
  const { onPagesShown, thumbnailsOpen, contentsOpen } = controls
  const panelOpen = thumbnailsOpen || contentsOpen
  const shownKey = nav.visiblePages.join(',')
  useEffect(() => {
    if (onPagesShown && !panelOpen) onPagesShown(shownKey.split(',').map(Number))
  }, [onPagesShown, panelOpen, shownKey])

  function select(pageNumber) {
    nav.onGoToPage(pageNumber)
    controls.onCloseThumbnails()
  }

  function selectSection(pageNumber) {
    nav.onGoToPage(pageNumber)
    controls.onCloseContents()
  }

  return (
    <>
      <ReaderNav nav={nav} controls={controls} color={color} tone={tone} navInset={navInset} />
      {thumbnailsOpen && (
        <ThumbnailPanel
          pages={pages}
          pageStore={controls.pageStore}
          thumbnails={controls.thumbnails}
          visiblePages={nav.visiblePages}
          onSelect={select}
          onClose={controls.onCloseThumbnails}
        />
      )}
      {contentsOpen && (
        <ContentsPanel
          contents={controls.contents}
          visiblePages={nav.visiblePages}
          layout={controls.contentsLayout}
          navInset={navInset}
          onSelect={selectSection}
          onClose={controls.onCloseContents}
        />
      )}
    </>
  )
}
