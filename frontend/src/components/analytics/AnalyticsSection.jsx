import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import api from '../../utils/api'
import { DEFAULT_RANGE, RANGE_OPTIONS, currentTimeZone, formatCount, lastViewedLabel, loadAccountReport, reportState } from '../../utils/analyticsReport'
import { DeviceBreakdown, SourceBreakdown } from './Breakdowns'
import FlipbookAnalyticsDetail from './FlipbookAnalyticsDetail'
import ViewsChart from './ViewsChart'

function StatCard({ label, value, hint }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-box bg-base-200 px-3 py-2.5">
      <span className="text-xs text-base-content/60">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] leading-snug text-base-content/50">{hint}</span>
    </div>
  )
}

function FlipbookRow({ row, expanded, onToggle, range, timeZone }) {
  const detailId = `analytics-detail-${row.id}`
  return (
    <li className="flex flex-col gap-2 border-b border-base-200 py-2 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md text-left hover:bg-base-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{row.title}</span>
          <span className="text-xs text-base-content/60">
            {row.isPublished ? 'Published' : 'Not published'} · {lastViewedLabel(row.lastViewedAt)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-sm font-semibold tabular-nums">{formatCount(row.views)}</span>
          <span className="text-xs tabular-nums text-base-content/60">
            {formatCount(row.uniqueVisitors)} {row.uniqueVisitors === 1 ? 'visitor' : 'visitors'}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-base-content/50 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div id={detailId}>
          <FlipbookAnalyticsDetail flipbookId={row.id} range={range} timeZone={timeZone} />
        </div>
      )}
    </li>
  )
}

// Analytics on the dashboard (Milestone 10): views, unique visitors and pages per view for the
// chosen period, views over time, devices and sources, and every flipbook with its own figures,
// most viewed first. Only the signed-in owner's flipbooks are included (checked by the server).
export default function AnalyticsSection() {
  const [range, setRange] = useState(DEFAULT_RANGE)
  const [timeZone] = useState(currentTimeZone)
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  // The latest answer and the request it answers; a newer request means it is loading.
  const requestKey = `${range}|${timeZone}|${reloadKey}`
  const [result, setResult] = useState({ key: null, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    loadAccountReport(api, range, timeZone).then((answer) => {
      if (cancelled) return
      // A failed refresh keeps the previous figures on screen with the error below them.
      setResult((current) => (answer.ok ? { key: requestKey, error: null, data: answer.data } : { key: requestKey, error: answer.message, data: current.data }))
    })
    return () => {
      cancelled = true
    }
  }, [range, timeZone, reloadKey, requestKey])

  const state = { loading: result.key !== requestKey, error: result.key === requestKey ? result.error : null, data: result.data }
  const view = reportState(state)
  const { data } = state
  const rangeLabel = RANGE_OPTIONS.find((option) => option.id === range)?.label.toLowerCase()
  const periodText = range === 'all' ? 'since the first view' : `in the last ${rangeLabel}`
  const anyPublished = data?.flipbooks.some((row) => row.isPublished)

  return (
    <section className="card bg-base-100 shadow-sm" aria-labelledby="analytics-title" data-testid="analytics-section">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-title" className="card-title text-base">
            Analytics
          </h2>
          <div className="join" role="group" aria-label="Period">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`btn join-item btn-xs ${option.id === range ? 'btn-active' : 'btn-ghost'}`}
                aria-pressed={option.id === range}
                onClick={() => {
                  setRange(option.id)
                  setExpandedId(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'loading' && (
          <div className="flex flex-col gap-3" aria-label="Loading analytics">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-20 animate-pulse rounded-box bg-base-200"></div>
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-box bg-base-200"></div>
          </div>
        )}

        {view === 'error' && (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="text-sm text-base-content/70">We couldn't load your analytics. {state.error}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          </div>
        )}

        {view === 'empty' && (
          <div className="flex flex-col gap-1 rounded-box bg-base-200 px-4 py-5 text-center" data-testid="analytics-empty">
            <p className="text-sm font-medium">No views {periodText}</p>
            <p className="text-xs text-base-content/60">
              {anyPublished
                ? 'Views appear here once someone opens one of your published flipbooks or embeds.'
                : 'Publish a flipbook and share its link. Views from visitors appear here.'}
            </p>
          </div>
        )}

        {view === 'ready' && (
          <div className={`flex flex-col gap-5 ${state.loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={state.loading}>
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
              <StatCard label="Views" value={formatCount(data.totals.views)} hint="Each visit counts once; reloads within 30 minutes don't add views." />
              <StatCard label="Unique visitors" value={formatCount(data.totals.uniqueVisitors)} hint="Different browsers that viewed, counted once each." />
              <StatCard label="Pages per view" value={formatCount(data.totals.averagePagesPerView)} hint="Average number of pages seen in a visit." />
            </div>
            <ViewsChart series={data.series} />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DeviceBreakdown devices={data.devices} />
              <SourceBreakdown sources={data.sources} />
            </div>
          </div>
        )}

        {state.error && data && (
          <div className="flex items-center justify-between gap-2 text-sm" role="alert">
            <span className="text-error">{state.error}</span>
            <button type="button" className="btn btn-outline btn-xs" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          </div>
        )}

        {data && data.flipbooks.length > 0 && (view === 'ready' || view === 'empty') && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Your flipbooks {periodText}</h3>
            <p className="text-xs text-base-content/60">Most viewed first. Open one for its pages, devices and sources.</p>
            <ul className="mt-1 flex flex-col">
              {data.flipbooks.map((row) => (
                <FlipbookRow
                  key={row.id}
                  row={row}
                  expanded={expandedId === row.id}
                  onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                  range={range}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          </section>
        )}

        <p className="text-[11px] leading-snug text-base-content/50">
          Counted from your public links and embeds; your own visits from this browser are left out. Visitors whose browsers ask not to be tracked are not counted.
          Days follow your time zone ({timeZone}).
        </p>
      </div>
    </section>
  )
}
