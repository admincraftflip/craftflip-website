import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import ViewerStylePicker from '../components/ViewerStylePicker'
import { resolveViewerStyle, saveViewerStyle, viewerStyleName } from '../utils/viewerStyles'
import FlipbookReader, { ViewerMessage } from '../components/FlipbookReader'
import { useStageSize } from '../hooks/useStageSize'
import { VIEWER_MESSAGES as MESSAGES } from '../utils/viewerMessages'
import ReaderBar from '../components/ReaderBar'
import { rememberOwnedFlipbooks } from '../utils/viewTracking'
import ReaderBackground from '../components/ReaderBackground'
import ReaderSettingsDialog from '../components/ReaderSettingsDialog'
import { useOwnerImage, useOwnerLogo } from '../hooks/useOwnerLogo'
import { backgroundAppearance, ctaToShow, isHexColor, readerOf } from '../utils/readerSettings'
import { searchAvailability } from '../utils/textSearch'

const PROCESSING_POLL_INTERVAL_MS = 3000

// Private preview of the signed-in user's own flipbook (Milestone 5), where the owner also picks its
// viewing style (Milestone 7) and customises the reader (Milestone 9; ?customize=1 opens the
// settings). The preview shows the saved logo, background, button colour, floating call to action
// and download control as visitors will see them. The public viewer is PublicViewerPage.
export default function FlipbookViewerPage() {
  const { id } = useParams()
  const [viewer, setViewer] = useState({ state: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const stageRef = useRef(null)
  const stage = useStageSize(stageRef)
  const [savingStyle, setSavingStyle] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const settingsOpen = searchParams.get('customize') === '1'

  // Private page images need the owner's Firebase token, so they come through the authenticated API.
  const loadPage = useCallback(
    async (pageNumber, signal, size) => {
      // size "thumb": the small preview for the page overview.
      const params = size === 'thumb' ? { size } : undefined
      const response = await api.get(`/api/flipbooks/${id}/pages/${pageNumber}/image`, { responseType: 'blob', signal, params })
      return response.data
    },
    [id]
  )

  // Text search (October 2026) in the owner's preview, through the authenticated API.
  const searchText = useCallback(
    async (query, signal) => {
      const response = await api.get(`/api/flipbooks/${id}/search`, { params: { q: query }, signal })
      return response.data.data
    },
    [id]
  )

  useEffect(() => {
    let cancelled = false
    let timer

    async function load() {
      try {
        const response = await api.get(`/api/flipbooks/${id}/pages`)
        if (cancelled) return
        const { flipbook, pages } = response.data.data
        setViewer({ state: 'loaded', flipbook, pages })
        // So the owner opening this flipbook's public link here is not counted in analytics.
        rememberOwnedFlipbooks([flipbook.slug])
        if (flipbook.status === 'processing') timer = setTimeout(load, PROCESSING_POLL_INTERVAL_MS)
      } catch (error) {
        if (cancelled) return
        setViewer({ state: error.response?.status === 404 ? 'notFound' : 'error' })
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, reloadKey])

  const flipbook = viewer.flipbook
  const viewerStyle = resolveViewerStyle(flipbook?.viewerStyle)
  const reader = readerOf(flipbook)
  const logoSrc = useOwnerLogo(id, reader.logo?.revision)
  // The uploaded background is loaded whenever one exists, so the settings dialog can show it too.
  const backgroundSrc = useOwnerImage(id, 'background', reader.background.image?.revision)

  function openSettings(open) {
    setSearchParams(open ? { customize: '1' } : {}, { replace: true })
  }

  function handleSettingsSaved(updated) {
    setViewer((current) => ({ ...current, flipbook: { ...current.flipbook, ...updated } }))
  }

  // The owner may always download their own original, through the authenticated route.
  async function handleOwnerDownload() {
    try {
      const response = await api.get(`/api/flipbooks/${id}/original`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = flipbook.originalFilename || 'flipbook.pdf'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error("We couldn't download the PDF. Please try again.")
    }
  }

  function setViewerStyle(style) {
    setViewer((current) => ({ ...current, flipbook: { ...current.flipbook, viewerStyle: style } }))
  }

  // The new style shows at once; it is saved on the flipbook (so the public link uses it too) and
  // put back if the save fails.
  async function handleStyleChange(style) {
    const previous = viewerStyle
    setViewerStyle(style)
    setSavingStyle(true)
    const result = await saveViewerStyle(api, id, style)
    setSavingStyle(false)
    if (result.ok) {
      setViewerStyle(resolveViewerStyle(result.flipbook.viewerStyle))
      toast.success(`Style saved: ${viewerStyleName(result.flipbook.viewerStyle)}`)
    } else {
      setViewerStyle(previous)
      toast.error(result.message)
    }
  }

  const canChooseStyle = viewer.state === 'loaded' && flipbook.status === 'ready' && viewer.pages.length > 0
  // The saved background, painted behind the pages only while the book itself is on screen.
  const background = canChooseStyle && stage ? backgroundAppearance(reader.background, backgroundSrc) : null
  const backLink = (
    <Link to="/dashboard" className="btn btn-ghost btn-sm gap-2" style={{ color: 'inherit' }}>
      <ArrowLeft size={16} aria-hidden="true" />
      {/* Icon only on phones, so the title keeps its room. */}
      <span className="sr-only sm:not-sr-only">Dashboard</span>
    </Link>
  )

  function renderContent() {
    if (viewer.state === 'loading' || !stage) {
      return (
        <ViewerMessage
          message={<span className="loading loading-dots loading-md text-stone-400" aria-label="Loading flipbook"></span>}
        />
      )
    }
    if (viewer.state === 'notFound') return <ViewerMessage message={MESSAGES.notFound} />
    if (viewer.state === 'error') {
      return (
        <ViewerMessage
          message={MESSAGES.error}
          action={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          }
        />
      )
    }
    // A deletion has started on this flipbook; its files may already be gone.
    if (flipbook.status === 'deleting') return <ViewerMessage message={MESSAGES.notFound} />
    if (flipbook.status === 'processing') return <ViewerMessage message={MESSAGES.processing} />
    if (flipbook.status === 'failed') {
      return (
        <ViewerMessage
          title="This PDF couldn't be converted"
          message={`${flipbook.conversionError ?? 'The conversion failed.'} You can retry it from the dashboard.`}
        />
      )
    }
    if (flipbook.status === 'uploaded') {
      return <ViewerMessage message="This PDF hasn't been converted yet. Start the conversion from the dashboard." />
    }
    if (viewer.pages.length === 0) return <ViewerMessage message="This flipbook has no pages to show." />

    return (
      <FlipbookReader
        pages={viewer.pages}
        loadPage={loadPage}
        stage={stage}
        viewerStyle={viewerStyle}
        controlColor={isHexColor(reader.primaryColor) ? reader.primaryColor : undefined}
        cta={ctaToShow(reader)}
        contents={reader.contents}
        searchText={searchText}
        search={searchAvailability(flipbook)}
        tone={background?.tone ?? null}
        fullscreenRef={stageRef}
      />
    )
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-stone-100">
      <ReaderBar
        title={flipbook?.title ?? ''}
        reader={reader}
        logoSrc={logoSrc}
        onDownload={handleOwnerDownload}
        leading={backLink}
        trailing={
          canChooseStyle && (
            <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => openSettings(true)} style={{ color: 'inherit' }}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          )
        }
      />
      {canChooseStyle && <ViewerStylePicker value={viewerStyle} onChange={handleStyleChange} disabled={savingStyle} />}
      <div ref={stageRef} className="relative isolate flex min-h-0 flex-1 flex-col bg-stone-100" style={background ? { backgroundColor: background.color } : undefined}>
        <ReaderBackground image={background?.image} />
        {renderContent()}
      </div>
      {canChooseStyle && (
        <ReaderSettingsDialog
          key={flipbook.id}
          flipbook={settingsOpen ? flipbook : null}
          logoSrc={logoSrc}
          backgroundSrc={backgroundSrc}
          onSaved={handleSettingsSaved}
          onClose={() => openSettings(false)}
        />
      )}
    </main>
  )
}
