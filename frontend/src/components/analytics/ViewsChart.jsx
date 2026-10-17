import { useEffect, useRef, useState } from 'react'
import { bucketLabel, columnLayout, formatCount, labelIndexes, niceScale } from '../../utils/analyticsReport'

const HEIGHT = 168
const AXIS_WIDTH = 32
const AXIS_HEIGHT = 22
const RADIUS = 4

// Column with a 4px rounded top and a square base on the baseline.
function columnPath({ x, y, width, height }) {
  if (height <= 0) return ''
  const radius = Math.min(RADIUS, width / 2, height)
  return `M${x},${y + height} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height} Z`
}

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

// Views over time: one column per day (or month for all time), on one count axis. Hovering,
// tapping or the arrow keys show the date, views and unique visitors for a column; "Show as
// table" gives every value without the chart.
export default function ViewsChart({ series }) {
  const wrapperRef = useRef(null)
  const width = useWidth(wrapperRef)
  const [active, setActive] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const { points, bucket } = series
  const plotWidth = Math.max(0, width - AXIS_WIDTH)
  const plotHeight = HEIGHT - AXIS_HEIGHT
  const scale = niceScale(Math.max(0, ...points.map((point) => point.views)))
  const columns = columnLayout(points, { width: plotWidth, height: plotHeight, maxValue: scale.max })
  const labels = new Set(labelIndexes(points.length, plotWidth))
  const shown = active !== null ? columns[active] : null
  const total = points.reduce((sum, point) => sum + point.views, 0)

  function handleKey(event) {
    if (event.key === 'ArrowRight') setActive((index) => Math.min(points.length - 1, index === null ? points.length - 1 : index + 1))
    else if (event.key === 'ArrowLeft') setActive((index) => Math.max(0, index === null ? points.length - 1 : index - 1))
    else if (event.key === 'Escape') setActive(null)
    else return
    event.preventDefault()
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">Views {bucket === 'month' ? 'per month' : 'per day'}</h4>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAsTable((value) => !value)} aria-pressed={asTable}>
          {asTable ? 'Show as chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-64 overflow-y-auto rounded-box border border-base-300">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>{bucket === 'month' ? 'Month' : 'Day'}</th>
                <th className="text-right">Views</th>
                <th className="text-right">Unique visitors</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.date}>
                  <td>{bucketLabel(point.date, bucket, undefined, { long: true })}</td>
                  <td className="text-right tabular-nums">{formatCount(point.views)}</td>
                  <td className="text-right tabular-nums">{formatCount(point.uniqueVisitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-base-content/30"
          tabIndex={0}
          role="group"
          aria-label={`Views ${bucket === 'month' ? 'per month' : 'per day'}: ${formatCount(total)} in total. Use the left and right arrow keys to read each ${bucket}.`}
          onKeyDown={handleKey}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          data-testid="views-chart"
        >
          {width > 0 && (
            <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden="true">
              {scale.ticks.map((tick) => {
                const y = plotHeight - (tick / scale.max) * plotHeight
                return (
                  <g key={tick}>
                    <line x1={AXIS_WIDTH} x2={width} y1={y + 0.5} y2={y + 0.5} className="stroke-base-content/10" strokeWidth="1" />
                    <text x={AXIS_WIDTH - 6} y={y} dy="0.32em" textAnchor="end" className="fill-base-content/50 text-[10px] tabular-nums">
                      {formatCount(tick)}
                    </text>
                  </g>
                )
              })}
              <g transform={`translate(${AXIS_WIDTH},0)`}>
                {columns.map((column, index) => (
                  <g key={column.date}>
                    <path d={columnPath(column)} fill="var(--cf-chart-series)" opacity={active === null || active === index ? 1 : 0.45} />
                    {/* The whole slot is the hover and tap target, so thin columns are easy to hit. */}
                    <rect x={column.hitX} y={0} width={column.hitWidth} height={plotHeight} fill="transparent" onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} />
                    {labels.has(index) && (
                      <text x={column.hitX + column.hitWidth / 2} y={plotHeight + 15} textAnchor="middle" className="fill-base-content/60 text-[10px]">
                        {bucketLabel(column.date, bucket)}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            </svg>
          )}
          {shown && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-md"
              style={{
                left: Math.min(Math.max(0, AXIS_WIDTH + shown.hitX + shown.hitWidth / 2 - 72), Math.max(0, width - 150)),
              }}
              role="status"
            >
              <p className="mb-1 text-base-content/60">{bucketLabel(shown.date, bucket, undefined, { long: true })}</p>
              <p>
                <span className="font-semibold tabular-nums">{formatCount(shown.views)}</span> {shown.views === 1 ? 'view' : 'views'}
              </p>
              <p>
                <span className="font-semibold tabular-nums">{formatCount(shown.uniqueVisitors)}</span> unique {shown.uniqueVisitors === 1 ? 'visitor' : 'visitors'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
