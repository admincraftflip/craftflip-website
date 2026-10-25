import { useEffect } from 'react'
import ReaderNav from './ReaderNav'
import ThumbnailPanel from './ThumbnailPanel'
import ContentsPanel from './ContentsPanel'
import SearchPanel from './SearchPanel'

// Everything a viewing style shows besides the book: the toolbar and, when open, the page
// overview, the table of contents or the search panel (one at a time). Each style passes its own
// page model as nav ({ label, firstPage, visiblePages, pageCount, atStart, atEnd, onPrevious,
// onNext, onGoToPage }); controls come from FlipbookReader. controls.onPagesShown, when given, hears the pages on screen
// after every move, but not while a panel is open.
export default function ReaderControls({ nav, controls, pages, color, tone, navInset }) {
  const { onPagesShown, thumbnailsOpen, contentsOpen, searchOpen } = controls
  const panelOpen = thumbnailsOpen || contentsOpen || searchOpen
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

  // A search result goes to its page; the panel stays open beside the book on wide stages and
  // closes where it covers the book.
  function selectResult(index, pageNumber) {
    controls.search.setSelected(index)
    nav.onGoToPage(pageNumber)
    if (controls.searchLayout !== 'side') controls.onCloseSearch()
  }

  // A section listed in the search panel (narrowest toolbar, utils/readerControls.js).
  function selectSearchSection(pageNumber) {
    nav.onGoToPage(pageNumber)
    controls.onCloseSearch()
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
      {searchOpen && (
        <SearchPanel
          search={controls.search}
          availability={controls.searchAvailability}
          contents={controls.buttons.contentsInSearch ? controls.contents : null}
          visiblePages={nav.visiblePages}
          layout={controls.searchLayout}
          navInset={navInset}
          onSelectResult={selectResult}
          onSelectSection={selectSearchSection}
          onClose={controls.onCloseSearch}
        />
      )}
    </>
  )
}
