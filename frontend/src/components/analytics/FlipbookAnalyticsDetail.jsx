import { useEffect, useState } from 'react'
import api from '../../utils/api'
import { formatCount, loadFlipbookReport, reportState } from '../../utils/analyticsReport'
import { DeviceBreakdown, ShareRow, SourceBreakdown } from './Breakdowns'
import ViewsChart from './ViewsChart'

const TOP_PAGES = 8

// One flipbook's figures for the chosen period, opened from the analytics list: its own chart,
// the pages shown in the most views, devices and sources.
export default function FlipbookAnalyticsDetail({ flipbookId, range, timeZone }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [allPages, setAllPages] = useState(false)
  const requestKey = `${flipbookId}|${range}|${timeZone}|${reloadKey}`
  const [result, setResult] = useState({ key: null, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    loadFlipbookReport(api, flipbookId, range, timeZone).then((answer) => {
      if (cancelled) return
      setResult(answer.ok ? { key: requestKey, error: null, data: answer.data } : { key: requestKey, error: answer.message, data: null })
    })
    return () => {
      cancelled = true
    }
  }, [flipbookId, range, timeZone, reloadKey, requestKey])

  const state = { loading: result.key !== requestKey, error: result.key === requestKey ? result.error : null, data: result.key === requestKey ? result.data : null }
  const view = reportState(state)
  if (view === 'loading') return <div className="h-24 animate-pulse rounded-box bg-base-200" aria-label="Loading this flipbook's analytics"></div>
  if (view === 'error') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-box bg-base-200 px-3 py-2 text-sm" role="alert">
        <span>{state.error}</span>
        <button type="button" className="btn btn-outline btn-xs" onClick={() => setReloadKey((key) => key + 1)}>
          Try again
        </button>
      </div>
    )
  }

  const { data } = state
  if (view === 'empty') return <p className="rounded-box bg-base-200 px-3 py-2 text-sm text-base-content/70">No views of this flipbook in this period.</p>

  const pagesByViews = [...data.pages].sort((first, second) => second.views - first.views || first.pageNumber - second.pageNumber)
  const shownPages = allPages ? pagesByViews : pagesByViews.slice(0, TOP_PAGES)

  return (
    <div className={`flex flex-col gap-5 rounded-box bg-base-200/60 p-3 ${state.loading ? 'opacity-60' : ''}`}>
      <ViewsChart series={data.series} />
      <section className="flex flex-col gap-2">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Most viewed pages</h5>
        {pagesByViews.length === 0 ? (
          <p className="text-xs text-base-content/60">Visitors opened it but no page stayed on screen long enough to count.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {shownPages.map((page) => (
                <ShareRow key={page.pageNumber} label={`Page ${page.pageNumber}`} value={page.views} max={pagesByViews[0].views} suffix={page.views === 1 ? ' view' : ' views'} />
              ))}
            </ul>
            {pagesByViews.length > TOP_PAGES && (
              <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setAllPages((value) => !value)}>
                {allPages ? 'Show fewer' : `Show all ${pagesByViews.length} pages`}
              </button>
            )}
          </>
        )}
        <p className="text-[11px] leading-snug text-base-content/50">
          The number of views in which a page was on screen for at least a second. Returning to a page in the same view does not count again. {formatCount(data.totals.averagePagesPerView)} pages per view on average.
        </p>
      </section>
      <DeviceBreakdown devices={data.devices} />
      <SourceBreakdown sources={data.sources} />
    </div>
  )
}
