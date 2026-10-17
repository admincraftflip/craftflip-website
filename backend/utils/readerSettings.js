// Reader customisation (Milestone 9; the background replaced the top-bar colour in the UI/UX
// decisions of October 2026): the button colour, the reader background, a call-to-action button
// and the PDF download switch. Everything a client sends is checked here against an explicit
// allowlist; the logo and the background image are uploaded separately (utils/logoImage.js).

const HEX_COLOR = /^#[0-9a-f]{6}$/
export const MAX_CTA_LABEL_LENGTH = 40
const MAX_CTA_URL_LENGTH = 2048
const READER_FIELDS = ['primaryColor', 'background', 'cta', 'allowDownload']
const CTA_FIELDS = ['enabled', 'label', 'url']
const BACKGROUND_FIELDS = ['kind', 'color', 'preset']

// default: the plain CraftFlip reader. color: a solid colour. preset: one of the bundled images in
// frontend/public/reader-backgrounds (same ids there). image: the owner's uploaded image.
export const BACKGROUND_KINDS = ['default', 'color', 'preset', 'image']
// tone: whether the image is light or dark, so the reader can keep its controls readable on it.
export const BACKGROUND_PRESETS = {
  'ivory-marble': { tone: 'light' },
  'pale-stone': { tone: 'light' },
  'warm-wood': { tone: 'light' },
  'misty-forest': { tone: 'dark' },
}
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

// A destination for the CTA: an absolute http(s) address with a real host name and no embedded
// credentials. javascript:, data:, relative and protocol-relative links are refused. Returns the
// normalised address, or null.
export function safeWebUrl(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > MAX_CTA_URL_LENGTH) return null
  let url
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  if (!url.hostname.includes('.') || url.username || url.password) return null
  return url.href
}

function normalizeLabel(value) {
  return value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseColor(value, name) {
  if (value === null) return { value: null }
  if (typeof value === 'string' && isHexColor(value.trim().toLowerCase())) return { value: value.trim().toLowerCase() }
  return { error: `${name} must be a colour like #1f4e79, or null for the default.` }
}

// The CTA is always sent whole. A disabled CTA may keep its label and link for later, but a stored
// link is always a safe one.
function parseCta(cta) {
  if (!isPlainObject(cta) || Object.keys(cta).some((key) => !CTA_FIELDS.includes(key)) || CTA_FIELDS.some((key) => !(key in cta))) {
    return { error: 'The call to action needs enabled, label and url, and nothing else.' }
  }
  if (typeof cta.enabled !== 'boolean' || typeof cta.label !== 'string' || typeof cta.url !== 'string') {
    return { error: 'The call to action needs enabled (true or false), a label and a link.' }
  }
  const label = normalizeLabel(cta.label)
  if (label.length > MAX_CTA_LABEL_LENGTH) return { error: `Button labels can be at most ${MAX_CTA_LABEL_LENGTH} characters.` }
  const url = cta.url.trim() === '' ? '' : safeWebUrl(cta.url)
  if (url === null) return { error: 'The button link must be a full web address starting with https:// (or http://).' }
  if (cta.enabled && (!label || !url)) return { error: 'To show the button, give it a label and a link.' }
  return { value: { enabled: cta.enabled, label, url } }
}

function isPreset(value) {
  return typeof value === 'string' && Object.hasOwn(BACKGROUND_PRESETS, value)
}

// The background is sent whole: kind, color and preset. The colour and preset are kept while
// another kind is chosen, so switching back restores them. The uploaded image is never set here.
function parseBackground(background) {
  if (
    !isPlainObject(background) ||
    Object.keys(background).some((key) => !BACKGROUND_FIELDS.includes(key)) ||
    BACKGROUND_FIELDS.some((key) => !(key in background))
  ) {
    return { error: 'The background needs kind, color and preset, and nothing else.' }
  }
  if (!BACKGROUND_KINDS.includes(background.kind)) return { error: `The background must be one of: ${BACKGROUND_KINDS.join(', ')}.` }
  const color = parseColor(background.color, 'The background colour')
  if (color.error) return { error: color.error }
  if (background.preset !== null && !isPreset(background.preset)) return { error: 'Choose one of the background presets.' }
  if (background.kind === 'color' && !color.value) return { error: 'Choose a background colour.' }
  if (background.kind === 'preset' && !background.preset) return { error: 'Choose a background preset.' }
  return { value: { kind: background.kind, color: color.value, preset: background.preset } }
}

// Turns { reader: {...} } from a PATCH body into MongoDB $set paths, or an error message.
export function parseReaderUpdate(reader) {
  if (!isPlainObject(reader)) return { error: 'Reader settings must be an object.' }
  const fields = Object.keys(reader)
  if (fields.length === 0 || fields.some((field) => !READER_FIELDS.includes(field))) {
    return { error: 'Reader settings can change only primaryColor, background, cta and allowDownload.' }
  }

  const set = {}
  if ('primaryColor' in reader) {
    const color = parseColor(reader.primaryColor, 'The button colour')
    if (color.error) return { error: color.error }
    set['reader.primaryColor'] = color.value
  }
  if ('background' in reader) {
    const background = parseBackground(reader.background)
    if (background.error) return { error: background.error }
    // Individual paths, so the uploaded image stored beside them is kept.
    for (const [field, value] of Object.entries(background.value)) set[`reader.background.${field}`] = value
  }
  if ('allowDownload' in reader) {
    if (typeof reader.allowDownload !== 'boolean') return { error: 'allowDownload must be true or false.' }
    set['reader.allowDownload'] = reader.allowDownload
  }
  if ('cta' in reader) {
    const cta = parseCta(reader.cta)
    if (cta.error) return { error: cta.error }
    set['reader.cta'] = cta.value
  }
  return { set }
}

function imageView(image) {
  return image?.publicId ? { width: image.width, height: image.height, revision: new Date(image.uploadedAt).getTime() } : null
}

// The background as stored, with anything incomplete read as the default: a colour kind without a
// colour, an unknown preset, or the image kind after its image was removed.
function backgroundView(background) {
  const color = isHexColor(background?.color) ? background.color : null
  const preset = isPreset(background?.preset) ? background.preset : null
  const image = imageView(background?.image)
  let kind = BACKGROUND_KINDS.includes(background?.kind) ? background.kind : 'default'
  if ((kind === 'color' && !color) || (kind === 'preset' && !preset) || (kind === 'image' && !image)) kind = 'default'
  return { kind, color, preset, image: image && { ...image, tone: background.image.tone === 'dark' ? 'dark' : 'light' } }
}

// What the owner sees and edits. Never includes the Cloudinary details of the logo or background.
// accentColor (the Milestone 9 top-bar colour) may still be stored on older flipbooks; it is no
// longer read, written or sent.
export function ownerReaderView(reader) {
  return {
    primaryColor: isHexColor(reader?.primaryColor) ? reader.primaryColor : null,
    background: backgroundView(reader?.background),
    logo: imageView(reader?.logo),
    cta: {
      enabled: reader?.cta?.enabled === true,
      label: reader?.cta?.label ?? '',
      url: reader?.cta?.url ?? '',
    },
    allowDownload: reader?.allowDownload === true,
  }
}

// Only the background in use: a stored colour, preset or image that is not chosen is not sent.
function publicBackground({ kind, color, preset, image }) {
  if (kind === 'color') return { kind, color }
  if (kind === 'preset') return { kind, preset, tone: BACKGROUND_PRESETS[preset].tone }
  if (kind === 'image') return { kind, revision: image.revision, tone: image.tone }
  return { kind: 'default' }
}

// What a visitor of a published flipbook needs. The CTA is included only when it is switched on
// and complete, with a link that passes the same check again.
export function publicReaderView(reader) {
  const owner = ownerReaderView(reader)
  const ctaUrl = safeWebUrl(owner.cta.url)
  return {
    primaryColor: owner.primaryColor,
    background: publicBackground(owner.background),
    logo: owner.logo,
    cta: owner.cta.enabled && owner.cta.label && ctaUrl ? { label: owner.cta.label, url: ctaUrl } : null,
    allowDownload: owner.allowDownload,
  }
}
