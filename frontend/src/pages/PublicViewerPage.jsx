import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import ReaderBar from '../components/ReaderBar'
import ReaderBackground from '../components/ReaderBackground'
import { backgroundAppearance, ctaToShow, isHexColor, publicBackgroundUrl, publicDownloadUrl, publicLogoUrl, readerOf } from '../utils/readerSettings'
import publicApi from '../utils/publicApi'
import FlipbookReader, { ViewerMessage } from '../components/FlipbookReader'
import { useStageSize } from '../hooks/useStageSize'
import { useViewTracking } from '../hooks/useViewTracking'
import { VIEWER_MESSAGES } from '../utils/viewerMessages'
import { publicViewerStateFor } from '../utils/publication'

const API_BASE = import.meta.env.VITE_API_BASE_URL

// Public viewer for a published flipbook (Milestone 6). No sign-in, no Firebase: it uses only
// the public API, which returns a flipbook while it is published and the same 404 otherwise.
// embed (Milestone 9, route /embed/:slug): the same viewer inside another website's iframe, with a
// slimmer bar and a link to open it full screen. Every request goes through the same public checks.
export default function PublicViewerPage({ embed = false }) {
  const { slug } = useParams()
  const [viewer, setViewer] = useState({ state: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const stageRef = useRef(null)
  const stage = useStageSize(stageRef)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await publicApi.get(`/api/public/flipbooks/${encodeURIComponent(slug)}`)
        if (!cancelled) setViewer({ state: 'loaded', flipbook: response.data.data.flipbook })
      } catch (error) {
        if (!cancelled) setViewer({ state: publicViewerStateFor(error) })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [slug, reloadKey])

  const loadPage = useCallback(
    async (pageNumber, signal, size) => {
      // size "thumb": the small preview for the page overview, under the same public checks.
      const response = await publicApi.get(`/api/public/flipbooks/${encodeURIComponent(slug)}/pages/${pageNumber}`, {
        responseType: 'blob',
        signal,
        params: size === 'thumb' ? { size } : undefined,
      })
      return response.data
    },
    [slug]
  )

  const flipbook = viewer.flipbook
  // Analytics (Milestone 10): the visit and the pages shown, once the flipbook has loaded.
  const onPagesShown = useViewTracking(API_BASE, slug, { active: viewer.state === 'loaded' && flipbook.pages.length > 0, embedded: embed })
  const reader = readerOf(flipbook)
  const logoSrc = flipbook && reader.logo ? publicLogoUrl(API_BASE, flipbook.slug, reader.logo.revision) : null
  // The background is painted behind the pages only while the book itself is on screen.
  const backgroundSrc = flipbook && reader.background.kind === 'image' ? publicBackgroundUrl(API_BASE, flipbook.slug, reader.background.image.revision) : null
  const showingBook = viewer.state === 'loaded' && Boolean(stage) && flipbook.pages.length > 0
  const background = showingBook ? backgroundAppearance(reader.background, backgroundSrc) : null

  function renderContent() {
    if (viewer.state === 'loading' || !stage) {
      return <ViewerMessage message={<span className="loading loading-dots loading-md text-stone-400" aria-label="Loading flipbook"></span>} />
    }
    if (viewer.state === 'notFound') return <ViewerMessage message={VIEWER_MESSAGES.notFound} />
    if (viewer.state === 'error' || flipbook.pages.length === 0) {
      return (
        <ViewerMessage
          message={VIEWER_MESSAGES.error}
          action={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          }
        />
      )
    }
    // The owner's saved style (Milestone 7); FlipbookReader falls back to Luxury Flip.
    return (
      <FlipbookReader
        pages={flipbook.pages}
        loadPage={loadPage}
        stage={stage}
        viewerStyle={flipbook.viewerStyle}
        controlColor={isHexColor(reader.primaryColor) ? reader.primaryColor : undefined}
        cta={ctaToShow(reader)}
        contents={reader.contents}
        tone={background?.tone ?? null}
        fullscreenRef={stageRef}
        onPagesShown={onPagesShown}
      />
    )
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-stone-100">
      {/* React hoists these into <head>. Crawlers that do not run JavaScript rely on the
          X-Robots-Tag header set by the host for /view/* (see vercel.json). */}
      <title>{flipbook ? `${flipbook.title} · CraftFlip` : 'CraftFlip'}</title>
      <meta name="robots" content="noindex, nofollow" />
      <ReaderBar
        compact={embed}
        title={flipbook?.title ?? ''}
        reader={reader}
        logoSrc={logoSrc}
        downloadHref={flipbook ? publicDownloadUrl(API_BASE, flipbook.slug) : null}
        trailing={
          embed ? (
            flipbook && (
              <a href={`/view/${flipbook.slug}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm btn-square" aria-label="Open full screen" title="Open full screen" style={{ color: 'inherit' }}>
                <Maximize2 size={16} aria-hidden="true" />
              </a>
            )
          ) : (
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">CraftFlip</span>
          )
        }
      />
      <div ref={stageRef} className="relative isolate flex min-h-0 flex-1 flex-col bg-stone-100" style={background ? { backgroundColor: background.color } : undefined}>
        <ReaderBackground image={background?.image} />
        {renderContent()}
      </div>
    </main>
  )
}
