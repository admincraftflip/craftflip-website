import { useState } from 'react'
import { Download } from 'lucide-react'

// The reader's top bar, shared by the owner preview, the public viewer and the embed: logo, title
// and PDF download (only when the owner allows it). The call to action is no longer here: it floats
// at the bottom right of the reader (ReaderCta), and the bar keeps the CraftFlip colours (the
// Milestone 9 top-bar colour was replaced by the reader background). leading and trailing hold
// page-specific controls (the owner's Dashboard link and Customize button).
export default function ReaderBar({ title, reader, logoSrc, downloadHref, onDownload, leading, trailing, compact = false }) {
  const [logoFailed, setLogoFailed] = useState(null)
  const canDownload = reader?.allowDownload === true && (downloadHref || onDownload)
  const showLogo = logoSrc && logoFailed !== logoSrc

  return (
    <header className={`flex items-center gap-2 border-b border-stone-200/80 bg-stone-100 px-3 text-stone-800 sm:gap-3 sm:px-4 ${compact ? 'py-1.5' : 'py-2.5'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading}
        {showLogo && <img src={logoSrc} alt="" className="h-7 max-w-[8.5rem] object-contain" onError={() => setLogoFailed(logoSrc)} />}
      </div>
      <h1 className="min-w-0 flex-[2] truncate text-center text-sm font-medium">{title}</h1>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {canDownload &&
          (downloadHref ? (
            <a href={downloadHref} className="btn btn-ghost btn-sm btn-square" aria-label="Download PDF" title="Download PDF">
              <Download size={18} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={onDownload} aria-label="Download PDF" title="Download PDF">
              <Download size={18} aria-hidden="true" />
            </button>
          ))}
        {trailing}
      </div>
    </header>
  )
}
