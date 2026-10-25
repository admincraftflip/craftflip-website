import { getApiErrorMessage } from './apiErrors.js'

// Reader customisation (Milestone 9; the background replaced the top-bar colour and the button
// became a floating one in the UI/UX decisions of October 2026). The server validates everything
// again (backend/utils/readerSettings.js); these checks give quick, clear messages.

export const MAX_CTA_LABEL_LENGTH = 40
export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024
export const MAX_CONTENTS_ENTRIES = 50
export const MAX_CONTENTS_TITLE_LENGTH = 80
const HEX_COLOR = /^#[0-9a-f]{6}$/i

// Temporary placeholder presets (CC0 images, see public/reader-backgrounds/CREDITS.md), to be
// replaced by a curated collection in the visual-design phase. The ids match the server allowlist.
export const BACKGROUND_PRESETS = [
  { id: 'ivory-marble', name: 'Ivory marble', tone: 'light' },
  { id: 'pale-stone', name: 'Pale stone', tone: 'light' },
  { id: 'warm-wood', name: 'Warm wood', tone: 'light' },
  { id: 'misty-forest', name: 'Misty forest', tone: 'dark' },
]

const DEFAULT_BACKGROUND = { kind: 'default', color: null, preset: null, image: null }

export const DEFAULT_READER = {
  primaryColor: null,
  background: DEFAULT_BACKGROUND,
  logo: null,
  cta: { enabled: false, label: '', url: '' },
  allowDownload: false,
  contents: [],
}

function presetById(id) {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? null
}

export function presetImageUrl(id) {
  return `/reader-backgrounds/${id}.webp`
}

export function presetThumbnailUrl(id) {
  return `/reader-backgrounds/${id}-thumb.webp`
}

// The background with defaults filled in, from either API. The owner API sends
// { kind, color, preset, image: { width, height, revision, tone } | null }; the public API sends only
// what is in use: { kind: 'color', color }, { kind: 'preset', preset, tone } or
// { kind: 'image', revision, tone }. Anything incomplete reads as the default, like on the server.
function backgroundOf(background) {
  if (!background) return DEFAULT_BACKGROUND
  const color = isHexColor(background.color) ? background.color : null
  const preset = presetById(background.preset) ? background.preset : null
  const image = background.image ?? (background.kind === 'image' && background.revision ? { revision: background.revision, tone: background.tone } : null)
  let kind = ['default', 'color', 'preset', 'image'].includes(background.kind) ? background.kind : 'default'
  if ((kind === 'color' && !color) || (kind === 'preset' && !preset) || (kind === 'image' && !image)) kind = 'default'
  return { kind, color, preset, image }
}

// The table of contents, from either API: { title, page } sections in page order. Anything
// malformed, and sections past the last page when the page count is known, are left out.
function contentsOf(contents, pageCount) {
  if (!Array.isArray(contents)) return []
  const lastPage = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : Infinity
  return contents
    .filter((entry) => typeof entry?.title === 'string' && entry.title.trim() && Number.isInteger(entry.page) && entry.page >= 1 && entry.page <= lastPage)
    .map((entry) => ({ title: entry.title, page: entry.page }))
    .sort((first, second) => first.page - second.page)
}

// Settings with defaults filled in. The owner API sends cta as { enabled, label, url }; the public
// API sends { label, url } only for a button that is shown (and null otherwise), so a cta without
// "enabled" is a shown one. accentColor from before the background is ignored.
export function readerOf(flipbook) {
  const reader = flipbook?.reader ?? {}
  const cta = reader.cta ? { enabled: reader.cta.enabled ?? true, label: reader.cta.label ?? '', url: reader.cta.url ?? '' } : DEFAULT_READER.cta
  return {
    primaryColor: reader.primaryColor ?? null,
    background: backgroundOf(reader.background),
    logo: reader.logo ?? null,
    cta,
    allowDownload: reader.allowDownload === true,
    contents: contentsOf(reader.contents, flipbook?.pageCount),
  }
}

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

// Background images (presets and uploads) are toned down when drawn so the brochure stays the
// focus: a soft blur and a neutral wash matching the image's tone. Applied by ReaderBackground in
// the browser only; the stored and bundled files are never changed. Solid colours are drawn as is.
export const BACKGROUND_IMAGE_TREATMENT = {
  blurPx: 6,
  overlay: { light: 'rgba(250, 250, 249, 0.45)', dark: 'rgba(28, 25, 23, 0.3)' },
}

const IMAGE_FALLBACK = { light: '#e7e5e4', dark: '#44403c' }

function imageLayer(url, tone) {
  return { color: IMAGE_FALLBACK[tone], image: url ? { url, blurPx: BACKGROUND_IMAGE_TREATMENT.blurPx, overlay: BACKGROUND_IMAGE_TREATMENT.overlay[tone] } : null, tone }
}

// How the reader's stage is painted behind the pages, or null for the plain default:
// { color: the stage colour (a solid background, or a matching colour under an image while it
// loads), image: { url, blurPx, overlay } or null, tone }. imageSrc is the uploaded image's address
// (a public URL, or a blob in the owner preview; null while loading). tone says whether the
// background is light or dark, so controls drawn on it stay readable.
export function backgroundAppearance(background, imageSrc) {
  if (background?.kind === 'color' && isHexColor(background.color)) {
    return { color: background.color, image: null, tone: readableTextColor(background.color) === '#ffffff' ? 'dark' : 'light' }
  }
  if (background?.kind === 'preset' && presetById(background.preset)) {
    const preset = presetById(background.preset)
    return imageLayer(presetImageUrl(preset.id), preset.tone)
  }
  if (background?.kind === 'image' && background.image) {
    return imageLayer(imageSrc, background.image.tone === 'dark' ? 'dark' : 'light')
  }
  return null
}

// Only absolute http(s) links with a real host and no credentials; the same rule as the server.
export function isSafeWebUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password
  } catch {
    return false
  }
}

// Black or white text, whichever reads better on the given background colour.
export function readableTextColor(hex) {
  if (!isHexColor(hex)) return null
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = (channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  return luminance > 0.4 ? '#1c1917' : '#ffffff'
}

// The button a visitor sees: only when switched on, labelled and pointing to a safe link.
export function ctaToShow(reader) {
  const cta = reader?.cta
  if (!cta || cta.enabled === false || !cta.label || !isSafeWebUrl(cta.url)) return null
  return { label: cta.label, url: cta.url.trim() }
}

// Control characters become spaces and runs of spaces one, as on the server.
function tidyTitle(value) {
  const text = Array.from(String(value ?? ''), (character) => (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character)).join('')
  return text.replace(/\s+/g, ' ').trim()
}

// The contents rows of the settings form ({ title, page } with page as typed), checked before
// saving against the book's page count. Returns a message, or null.
export function contentsFormProblem(rows, pageCount) {
  if (rows.length === 0) return null
  if (rows.length > MAX_CONTENTS_ENTRIES) return `The contents can have at most ${MAX_CONTENTS_ENTRIES} sections.`
  if (!pageCount) return 'Contents can be added once the flipbook is ready.'
  for (const [index, row] of rows.entries()) {
    const title = tidyTitle(row.title)
    if (!title) return `Section ${index + 1} needs a title.`
    if (title.length > MAX_CONTENTS_TITLE_LENGTH) return `Section titles can be at most ${MAX_CONTENTS_TITLE_LENGTH} characters.`
    const page = String(row.page ?? '').trim()
    if (!/^\d{1,4}$/.test(page) || Number(page) < 1 || Number(page) > pageCount) return `Section ${index + 1} needs a page from 1 to ${pageCount}.`
  }
  return null
}

// The contents rows as the API takes them: tidied titles, page numbers, in page order.
export function contentsUpdate(rows) {
  return rows.map((row) => ({ title: tidyTitle(row.title), page: Number(String(row.page).trim()) })).sort((first, second) => first.page - second.page)
}

// The settings form, checked before saving. Returns a message, or null when it can be saved.
// pageCount: the book's page count, for the contents.
export function readerFormProblem(form, pageCount = null) {
  if (form.primaryColor !== null && !isHexColor(form.primaryColor)) return 'The button colour must be like #1f4e79.'
  const { background } = form
  if (background.color !== null && !isHexColor(background.color)) return 'The background colour must be like #1f4e79.'
  if (background.kind === 'color' && !background.color) return 'Choose a background colour.'
  if (background.kind === 'preset' && !presetById(background.preset)) return 'Choose a background preset.'
  const label = form.cta.label.trim()
  if (label.length > MAX_CTA_LABEL_LENGTH) return `Button labels can be at most ${MAX_CTA_LABEL_LENGTH} characters.`
  if (form.cta.url.trim() && !isSafeWebUrl(form.cta.url)) return 'The button link must be a full web address starting with https://.'
  if (form.cta.enabled && (!label || !form.cta.url.trim())) return 'To show the button, give it a label and a link.'
  return form.contents ? contentsFormProblem(form.contents, pageCount) : null
}

// The PATCH body for the settings (the logo and background image are uploaded separately).
export function readerUpdate(form) {
  const { background } = form
  return {
    reader: {
      primaryColor: form.primaryColor ? form.primaryColor.toLowerCase() : null,
      background: { kind: background.kind, color: background.color ? background.color.toLowerCase() : null, preset: background.preset ?? null },
      cta: { enabled: form.cta.enabled, label: form.cta.label.trim(), url: form.cta.url.trim() },
      allowDownload: form.allowDownload,
      ...(form.contents && { contents: contentsUpdate(form.contents) }),
    },
  }
}

export function publicLogoUrl(apiBase, slug, revision) {
  return `${apiBase}/api/public/flipbooks/${encodeURIComponent(slug)}/logo?v=${revision}`
}

export function publicBackgroundUrl(apiBase, slug, revision) {
  return `${apiBase}/api/public/flipbooks/${encodeURIComponent(slug)}/background?v=${revision}`
}

export function publicDownloadUrl(apiBase, slug) {
  return `${apiBase}/api/public/flipbooks/${encodeURIComponent(slug)}/download`
}

async function sendLogoRequest(request) {
  try {
    const response = await request()
    return { ok: true, flipbook: response.data.data.flipbook }
  } catch (error) {
    return { ok: false, missing: error.response?.status === 404, message: getApiErrorMessage(error) }
  }
}

export function uploadLogo(client, flipbookId, file) {
  const form = new FormData()
  form.append('logo', file)
  return sendLogoRequest(() => client.post(`/api/flipbooks/${flipbookId}/logo`, form))
}

export function removeLogo(client, flipbookId) {
  return sendLogoRequest(() => client.delete(`/api/flipbooks/${flipbookId}/logo`))
}

// Uploading a background image also makes it the chosen background (saved straight away).
export function uploadBackground(client, flipbookId, file) {
  const form = new FormData()
  form.append('background', file)
  return sendLogoRequest(() => client.post(`/api/flipbooks/${flipbookId}/background`, form))
}

export function removeBackground(client, flipbookId) {
  return sendLogoRequest(() => client.delete(`/api/flipbooks/${flipbookId}/background`))
}

// ---------- Embed ----------

export const EMBED_LIMITS = { minWidth: 280, maxWidth: 2000, minHeight: 320, maxHeight: 2000 }

function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function clamp(value, min, max, fallback) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function embedUrl(origin, slug) {
  return `${origin}/embed/${encodeURIComponent(slug)}`
}

// iframe code for a website. responsive: full width with a 3:2 shape that scales with the page;
// otherwise a fixed width (or 100%) and height in pixels.
export function embedCode({ origin, slug, title, responsive = true, width = '100%', height = 600 }) {
  const src = embedUrl(origin, slug)
  const name = escapeAttribute(title || 'Flipbook')
  const frame = `src="${src}" title="${name}" loading="lazy" allowfullscreen`
  if (responsive) {
    return `<div style="position:relative;width:100%;aspect-ratio:3/2;">\n  <iframe ${frame} style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>\n</div>`
  }
  const frameWidth = width === '100%' ? '100%' : String(clamp(width, EMBED_LIMITS.minWidth, EMBED_LIMITS.maxWidth, 800))
  const frameHeight = clamp(height, EMBED_LIMITS.minHeight, EMBED_LIMITS.maxHeight, 600)
  return `<iframe ${frame} width="${frameWidth}" height="${frameHeight}" style="border:0;max-width:100%;"></iframe>`
}
