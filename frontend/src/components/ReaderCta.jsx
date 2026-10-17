import { ArrowUpRight } from 'lucide-react'
import { readableTextColor } from '../utils/readerSettings'

const DEFAULT_BUTTON_COLOR = '#292524'

// The floating call-to-action button, at the bottom right of the reader stage in every style.
// cta comes from ctaToShow (switched on, labelled, safe link), so this only draws it. It stays in
// place while pages turn; FlipbookReader keeps room for it (ctaPlacement in utils/bookLayout.js).
// The offsets respect the device's safe areas (notches, home indicator).
// placement "beside-nav" lines it up with the page navigation; "below-nav" puts it in the strip
// kept free under the navigation on narrow screens.
export default function ReaderCta({ cta, color, placement }) {
  const background = color ?? DEFAULT_BUTTON_COLOR
  const inset = placement === 'beside-nav' ? '1.375rem' : '0.75rem'
  return (
    <a
      href={cta.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="btn btn-sm absolute z-10 h-9 max-w-[min(15rem,calc(100%-1.5rem))] gap-1.5 rounded-full border-0 px-4 normal-case shadow-lg"
      style={{
        backgroundColor: background,
        color: readableTextColor(background),
        right: 'max(0.75rem, env(safe-area-inset-right))',
        bottom: `max(${inset}, env(safe-area-inset-bottom))`,
      }}
      data-testid="reader-cta"
    >
      <span className="truncate">{cta.label}</span>
      <ArrowUpRight size={15} className="shrink-0" aria-hidden="true" />
    </a>
  )
}
