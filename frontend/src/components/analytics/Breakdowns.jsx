import { deviceShares, formatCount, sourceLabel } from '../../utils/analyticsReport'

// A labelled row with a thin bar showing its share of the largest value. The number is always
// printed, so the bar is never the only way to read it.
export function ShareRow({ label, value, max, suffix }) {
  // Zero draws no bar; any other value at least a visible sliver.
  const percent = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-base-content/70">
          {formatCount(value)}
          {suffix}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-base-200" aria-hidden="true">
        <div className="h-1.5 rounded-full" style={{ width: `${percent}%`, backgroundColor: 'var(--cf-chart-series)' }}></div>
      </div>
    </li>
  )
}

export function DeviceBreakdown({ devices }) {
  const shares = deviceShares(devices)
  return (
    <section className="flex flex-col gap-2">
      <h5 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Devices</h5>
      <ul className="flex flex-col gap-2">
        {shares.map((share) => (
          <ShareRow key={share.type} label={share.label} value={share.views} max={shares[0].views} suffix={` · ${share.percent}%`} />
        ))}
      </ul>
    </section>
  )
}

export function SourceBreakdown({ sources }) {
  return (
    <section className="flex flex-col gap-2">
      <h5 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Where views came from</h5>
      {sources.length === 0 ? (
        <p className="text-xs text-base-content/60">No views in this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.map((source) => (
            <ShareRow key={`${source.host}-${source.embedded}`} label={sourceLabel(source)} value={source.views} max={sources[0].views} />
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-snug text-base-content/50">
        The site a visitor came from, when their browser shares it. Links opened from apps, emails and messages usually show as direct.
      </p>
    </section>
  )
}
