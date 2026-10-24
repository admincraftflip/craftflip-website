import { VIEWER_MESSAGES } from './viewerMessages.js'

// Link previews for public flipbook links (Milestone 13). Social apps fetch /view/<slug> without
// running JavaScript, so the React app cannot give them the flipbook's title and image. vercel.json
// sends those requests (recognised by their user agent) to the Vercel Function in api/view.js,
// which returns index.html with Open Graph and X card tags filled in from the public API. Visitors
// never pass through it. See REFERENCE.md, "Social previews (Milestone 13)".

export const SITE_NAME = 'CraftFlip'

// The user agents of link preview fetchers: Facebook, Messenger, Instagram and iMessage
// (facebookexternalhit, Facebot), X, LinkedIn, Slack, Discord, Telegram, WhatsApp and Signal
// (WhatsApp), Pinterest, Reddit, Microsoft Teams, Skype and Outlook, Embedly, Iframely, VK,
// Mastodon, Bluesky (Cardyb) and Snapchat. Search engines are left out (public flipbooks are
// noindex), and so are in-app browsers, which must get the normal app. Vercel matches it against
// the whole header, so it starts and ends with .*. It must stay identical to the "has" condition in
// vercel.json (checked in socialPreview.test.js).
export const LINK_PREVIEW_USER_AGENTS =
  '.*(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|WhatsApp/|Pinterestbot|Pinterest/0\\.|redditbot|SkypeUriPreview|MicrosoftPreview|Embedly|Iframely|vkShare|Mastodon/|Cardyb|Snap URL Preview).*'

// The generic tags in index.html sit between these markers and are replaced for a flipbook.
export const SOCIAL_MARKERS = { start: '<!-- social-preview:start -->', end: '<!-- social-preview:end -->' }

// Matches the backend (backend/utils/slug.js); the public API checks again.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SLUG_LENGTH = 80
const HOST_PATTERN = /^[a-z0-9.-]+(?::\d{1,5})?$/i
// Crawlers wait several seconds for a page; both lookups stay well inside that.
const API_TIMEOUT_MS = 2500
const SHELL_TIMEOUT_MS = 2000

export function isPublicSlug(slug) {
  return typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug)
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function describeFlipbook(pageCount) {
  return Number.isInteger(pageCount) && pageCount > 0
    ? `Flip through this ${pageCount}-page flipbook online, on any device.`
    : 'Flip through this flipbook online, on any device.'
}

// The image address on the API, or null when there is no image or no usable API address.
export function socialImageUrl(apiBaseUrl, flipbook) {
  const revision = flipbook?.socialImage?.revision
  if (!Number.isFinite(revision) || !isPublicSlug(flipbook.slug)) return null
  let base
  try {
    base = new URL(apiBaseUrl)
  } catch {
    return null
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null
  const path = `${base.pathname.replace(/\/+$/, '')}/api/public/flipbooks/${flipbook.slug}/social-image`
  return `${base.origin}${path}?v=${revision}`
}

// [attribute, key, content] for every tag. With an image the cards are large ("summary_large_image");
// without one they show the title and description only.
export function socialPreviewTags({ flipbook, pageUrl, apiBaseUrl }) {
  const title = flipbook.title
  const description = describeFlipbook(flipbook.pageCount)
  const imageUrl = socialImageUrl(apiBaseUrl, flipbook)
  const tags = [
    ['name', 'description', description],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'website'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
  ]
  if (pageUrl) tags.push(['property', 'og:url', pageUrl])
  if (imageUrl) {
    const alt = `First page of ${title}`
    tags.push(
      ['property', 'og:image', imageUrl],
      ...(imageUrl.startsWith('https:') ? [['property', 'og:image:secure_url', imageUrl]] : []),
      ['property', 'og:image:type', 'image/jpeg'],
      ['property', 'og:image:width', String(flipbook.socialImage.width)],
      ['property', 'og:image:height', String(flipbook.socialImage.height)],
      ['property', 'og:image:alt', alt]
    )
  }
  tags.push(['name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary'], ['name', 'twitter:title', title], ['name', 'twitter:description', description])
  if (imageUrl) tags.push(['name', 'twitter:image', imageUrl], ['name', 'twitter:image:alt', `First page of ${title}`])
  return tags
}

export function renderTags(tags) {
  return tags.map(([attribute, key, content]) => `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`).join('\n    ')
}

// Puts the tags between the markers of index.html (or before </head> if they are missing) and the
// title into <title>. Everything else in the page, including the app's scripts, is unchanged.
export function injectSocialPreview(shell, { title, tags }) {
  const block = `${SOCIAL_MARKERS.start}\n    ${renderTags(tags)}\n    ${SOCIAL_MARKERS.end}`
  const start = shell.indexOf(SOCIAL_MARKERS.start)
  const end = shell.indexOf(SOCIAL_MARKERS.end)
  // Replacement functions, so "$&" and similar in a title are never read as replacement patterns.
  let html =
    start !== -1 && end > start
      ? shell.slice(0, start) + block + shell.slice(end + SOCIAL_MARKERS.end.length)
      : shell.replace('</head>', () => `    ${block}\n  </head>`)
  if (title) html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
  return html
}

// Used only if index.html cannot be loaded: enough for a crawler, with a link for a person.
function minimalPage({ title, tags, pageUrl, message }) {
  const link = pageUrl ? `<p><a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a></p>` : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    ${renderTags(tags)}
  </head>
  <body>
    ${message ? `<p>${escapeHtml(message)}</p>` : link}
  </body>
</html>
`
}

function firstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : (value ?? ''))
    .split(',')[0]
    .trim()
}

// The site's own address as the crawler asked for it (Vercel sets these headers). null if unusable.
export function requestOrigin(headers = {}) {
  const host = firstHeaderValue(headers['x-forwarded-host'] || headers.host)
  if (!HOST_PATTERN.test(host)) return null
  const protocol = firstHeaderValue(headers['x-forwarded-proto']).toLowerCase()
  return `${protocol === 'http' ? 'http' : 'https'}://${host.toLowerCase()}`
}

async function loadShell(fetchImpl, origin) {
  if (!origin) return null
  try {
    const response = await fetchImpl(`${origin}/index.html`, { signal: AbortSignal.timeout(SHELL_TIMEOUT_MS) })
    if (!response.ok) return null
    const html = await response.text()
    return html.includes('<div id="root">') ? html : null
  } catch {
    return null
  }
}

// { state: 'found', flipbook } | { state: 'notFound' } | { state: 'error' }. Only the public API is
// asked, so unpublished, deleted and unconverted flipbooks are "notFound" and reveal nothing.
async function lookupFlipbook(fetchImpl, apiBaseUrl, slug) {
  if (!isPublicSlug(slug)) return { state: 'notFound' }
  if (!apiBaseUrl) return { state: 'error' }
  try {
    const base = String(apiBaseUrl).replace(/\/+$/, '')
    const response = await fetchImpl(`${base}/api/public/flipbooks/${slug}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
    if (response.status === 404) return { state: 'notFound' }
    if (!response.ok) return { state: 'error' }
    const flipbook = (await response.json())?.data?.flipbook
    if (!flipbook || flipbook.slug !== slug || typeof flipbook.title !== 'string') return { state: 'error' }
    return { state: 'found', flipbook }
  } catch {
    return { state: 'error' }
  }
}

// The Vercel Function's handler (Node request and response). Never throws: when the API is slow
// or down, the crawler gets the plain app page, so the link still works, just without a preview.
export function createSocialPreviewHandler({ apiBaseUrl, fetchImpl = fetch }) {
  return async function socialPreviewHandler(req, res) {
    const slug = new URL(req.url ?? '/', 'http://localhost').searchParams.get('slug') ?? ''
    const origin = requestOrigin(req.headers)
    const pageUrl = origin && isPublicSlug(slug) ? `${origin}/view/${slug}` : null
    const [shell, lookup] = await Promise.all([loadShell(fetchImpl, origin), lookupFlipbook(fetchImpl, apiBaseUrl, slug)])

    let status = 200
    let html
    if (lookup.state === 'found') {
      const { flipbook } = lookup
      const tags = socialPreviewTags({ flipbook, pageUrl, apiBaseUrl })
      const title = `${flipbook.title} · ${SITE_NAME}`
      html = shell ? injectSocialPreview(shell, { title, tags }) : minimalPage({ title, tags, pageUrl })
    } else {
      // Not found: a 404, so apps show no preview card. Error: the plain app page.
      status = lookup.state === 'notFound' ? 404 : 200
      html = shell ?? minimalPage({ title: SITE_NAME, tags: [], pageUrl, message: lookup.state === 'notFound' ? VIEWER_MESSAGES.notFound : null })
    }

    res.statusCode = status
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Never cached, so unpublishing takes effect at once; kept out of search engines like /view/*.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.end(html)
  }
}
