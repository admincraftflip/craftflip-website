import { conversionProgressView } from '../utils/conversionProgress'

// Live conversion progress for one dashboard row, from the server's conversionProgress.
// The dashboard polls while any flipbook is processing; this only renders what it was given.
export default function ConversionProgress({ progress }) {
  const view = conversionProgressView(progress)
  return (
    <div className="mt-2 flex flex-col gap-1" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{view.label}</span>
        <span className="tabular-nums text-base-content/60">{view.percent}%</span>
      </div>
      <progress
        className="progress progress-primary h-1.5 w-full"
        value={view.percent}
        max="100"
        aria-label={`Conversion ${view.percent}% complete`}
      ></progress>
      {view.detail && <span className="text-xs text-base-content/60">{view.detail}</span>}
      <span className="text-xs text-base-content/50">Conversion runs on our server, so you can leave this page and come back.</span>
    </div>
  )
}
