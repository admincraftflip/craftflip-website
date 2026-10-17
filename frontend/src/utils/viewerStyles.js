import { getApiErrorMessage } from './apiErrors.js'

// The four viewing styles (PROJECT.md, Flip styles). The ids match the backend allowlist
// (backend/utils/viewerStyles.js); the server stores the id and sends it to both viewers.
export const VIEWER_STYLES = [
  { id: 'luxury-flip', name: 'Luxury Flip', description: 'Realistic page turns with soft shadows.' },
  { id: 'clean-swipe', name: 'Clean Swipe', description: 'One page at a time, quick horizontal swipes.' },
  { id: 'classic-book', name: 'Classic Book', description: 'A bound book with a spine and deeper page turns.' },
  { id: 'editorial', name: 'Editorial', description: 'Calm fades between spreads, no page curl.' },
]

export const DEFAULT_VIEWER_STYLE = 'luxury-flip'

// Settings for the two styles built on react-pageflip. Classic Book turns slower with deeper
// shadows and is drawn as a bound book (spine and page edges).
export const PAGE_FLIP_SETTINGS = {
  'luxury-flip': { flippingTime: 900, maxShadowOpacity: 0.35, bound: false },
  'classic-book': { flippingTime: 1100, maxShadowOpacity: 0.8, bound: true },
}

export function resolveViewerStyle(id) {
  return VIEWER_STYLES.some((style) => style.id === id) ? id : DEFAULT_VIEWER_STYLE
}

export function viewerStyleName(id) {
  return VIEWER_STYLES.find((style) => style.id === resolveViewerStyle(id)).name
}

// Saves the style; returns the server's updated flipbook, or the message to show on failure.
export async function saveViewerStyle(client, flipbookId, viewerStyle) {
  try {
    const response = await client.patch(`/api/flipbooks/${flipbookId}`, { viewerStyle })
    return { ok: true, flipbook: response.data.data.flipbook }
  } catch (error) {
    return { ok: false, message: getApiErrorMessage(error) }
  }
}
