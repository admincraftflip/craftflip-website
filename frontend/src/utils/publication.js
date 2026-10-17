// Publishing helpers shared by the dashboard and the public viewer. No Firebase or API imports,
// so the public viewer can use them and they can be tested with Node's test runner.

export function publicFlipbookPath(slug) {
  return `/view/${slug}`
}

export function publicFlipbookUrl(origin, slug) {
  return `${origin}${publicFlipbookPath(slug)}`
}

// A link is shown as live only for a Ready flipbook the server reports as published.
export function isLive(flipbook) {
  return flipbook.status === 'ready' && flipbook.isPublished === true
}

export function canPublish(flipbook) {
  return flipbook.status === 'ready' && !flipbook.isPublished
}

// Public viewer state for a failed metadata request: any 404 means the link is not live.
export function publicViewerStateFor(error) {
  return error.response?.status === 404 ? 'notFound' : 'error'
}

// Copies the link; returns false when the browser refuses (no permission, insecure context),
// so the caller can show the link for manual copying instead.
export async function copyLink(clipboard, url) {
  try {
    if (!clipboard?.writeText) return false
    await clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}
