// The four viewing styles (PROJECT.md, Flip styles). The identifiers are stored on the flipbook
// and sent to the viewer; the frontend keeps the matching names and behaviour.
export const VIEWER_STYLES = ['luxury-flip', 'clean-swipe', 'classic-book', 'editorial']
export const DEFAULT_VIEWER_STYLE = 'luxury-flip'

export function isViewerStyle(value) {
  return typeof value === 'string' && VIEWER_STYLES.includes(value)
}

// Flipbooks created before styles existed have no value; they read as the default.
export function resolveViewerStyle(value) {
  return isViewerStyle(value) ? value : DEFAULT_VIEWER_STYLE
}
