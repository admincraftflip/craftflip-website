import { VIEWER_STYLES } from '../utils/viewerStyles'

// Small drawings of each style, made from boxes (no image assets).
function StyleSketch({ id }) {
  const page = 'h-7 w-5 rounded-[1px] bg-white ring-1 ring-stone-300'
  if (id === 'clean-swipe') {
    return (
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className={page}></span>
        <span className="h-7 w-2 rounded-l-[1px] bg-white/60 ring-1 ring-stone-200"></span>
      </span>
    )
  }
  if (id === 'classic-book') {
    return (
      <span className="flex items-end" aria-hidden="true">
        <span className={`${page} shadow-[0_2px_0_-1px_#d6d3d1]`}></span>
        <span className="h-7 w-px bg-stone-500"></span>
        <span className={`${page} shadow-[0_2px_0_-1px_#d6d3d1]`}></span>
      </span>
    )
  }
  if (id === 'editorial') {
    return (
      <span className="flex flex-col items-center gap-1" aria-hidden="true">
        <span className="flex gap-1">
          <span className="h-6 w-4 bg-white ring-1 ring-stone-300"></span>
          <span className="h-6 w-4 bg-white ring-1 ring-stone-300"></span>
        </span>
        <span className="h-px w-6 bg-stone-300"></span>
      </span>
    )
  }
  return (
    <span className="flex" aria-hidden="true">
      <span className={page}></span>
      <span className={`${page} bg-gradient-to-l from-stone-200 to-white`}></span>
    </span>
  )
}

// The owner's style choice in the preview page's toolbar: the four styles, the current one marked.
// onChange saves it. The row spans the full page width and centres the group, so it sits in the
// middle of the viewport whatever is in the bar above it. On phones the drawings are hidden to
// fit all four names on one line; on the narrowest screens the group wraps onto two lines rather
// than scrolling sideways.
export default function ViewerStylePicker({ value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap justify-center gap-1 px-3 pb-1.5 sm:gap-2 sm:px-4" role="radiogroup" aria-label="Viewing style">
      {VIEWER_STYLES.map((style) => {
        const selected = style.id === value
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={style.description}
            disabled={disabled}
            onClick={() => !selected && onChange(style.id)}
            className={`flex shrink-0 items-center gap-2 rounded-box border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-60 sm:px-3 ${
              selected ? 'border-stone-800 bg-white text-stone-900' : 'border-transparent text-stone-600 hover:border-stone-300 hover:bg-white/60'
            }`}
          >
            <span className="hidden sm:inline-flex">
              <StyleSketch id={style.id} />
            </span>
            <span className="whitespace-nowrap font-medium">{style.name}</span>
          </button>
        )
      })}
    </div>
  )
}
