import { getResendSettings, RESEND_API_URL } from '../config/resend.js'

// Sends one transactional email through the Resend REST API (Node's built-in fetch, no SDK).
// sendEmail never throws: callers get { status: 'sent', id }, { status: 'skipped', reason } or
// { status: 'failed', reason, retryable }, so an email problem can never break the flow that sent
// it. Logs carry the template name, outcome and Resend's redacted error, never the address,
// subject, content or API key.

const REQUEST_TIMEOUT_MS = 10_000
const MAX_SUBJECT_LENGTH = 200
const MAX_IDEMPOTENCY_KEY_LENGTH = 256
// Deliberately simple: one @, no spaces or angle brackets, a dot in the domain. Resend validates
// fully; this keeps header injection and obvious junk from ever reaching the API.
const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/
const TAG_PATTERN = /^[A-Za-z0-9_-]{1,256}$/
// Resend rejects requests without a User-Agent with a 403, so the client is named explicitly
// instead of relying on the runtime's generic default ("node").
const USER_AGENT = 'CraftFlip/1.0 (+https://flip.thecraftaxis.com)'

export function isValidEmailAddress(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value)
}

function validateMessage({ to, subject, html, text, template, idempotencyKey }) {
  if (!isValidEmailAddress(to)) return 'invalid_recipient'
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    return 'invalid_subject'
  }
  if (typeof html !== 'string' || !html || typeof text !== 'string' || !text) return 'invalid_body'
  if (!TAG_PATTERN.test(template)) return 'invalid_template'
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)) {
    return 'invalid_idempotency_key'
  }
  return null
}

// Resend errors are JSON ({ statusCode, name, message }). A request blocked before it reaches
// Resend gets Cloudflare's plain-text "error code: NNNN" instead (Resend documents 1010 as a missing
// User-Agent header), so a non-JSON body is reduced to that code and its content type.
const MAX_ERROR_BODY_CHARS = 16_000
const MAX_LOGGED_MESSAGE_LENGTH = 300
const API_KEY_IN_TEXT = /re_[A-Za-z0-9_-]+/g
const EMAIL_IN_TEXT = /[^\s@<>,;"'()[\]]+@[^\s@<>,;"'()[\]]+/g
const CLOUDFLARE_ERROR_CODE = /error code:?\s*(\d{3,5})/i
const CONTENT_TYPE_PATTERN = /^[A-Za-z0-9.+/-]{1,100}$/
const RAY_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/

// Error messages can quote what was sent, so known private values, anything shaped like an API
// key or an email address, and control characters are removed before a message is logged.
export function redactErrorMessage(text, privateValues = []) {
  let safe = String(text)
  for (const value of privateValues) {
    if (typeof value === 'string' && value) safe = safe.split(value).join('[redacted]')
  }
  return safe
    .replace(API_KEY_IN_TEXT, '[redacted]')
    .replace(EMAIL_IN_TEXT, '[address]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LOGGED_MESSAGE_LENGTH)
}

export async function readErrorDetails(response, privateValues = []) {
  const rayId = response.headers.get('cf-ray')
  const details = {
    status: response.status,
    name: 'unknown',
    message: '',
    rayId: rayId && RAY_ID_PATTERN.test(rayId) ? rayId : null,
  }

  let raw
  try {
    raw = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS)
  } catch {
    details.message = 'unreadable response body'
    return details
  }

  let body = null
  try {
    body = JSON.parse(raw)
  } catch {
    body = null
  }

  if (body && typeof body === 'object') {
    const source = body.error && typeof body.error === 'object' ? body.error : body
    if (typeof source.name === 'string' && TAG_PATTERN.test(source.name)) details.name = source.name
    if (typeof source.message === 'string') details.message = redactErrorMessage(source.message, privateValues)
    if (Number.isInteger(source.statusCode) && source.statusCode !== response.status) {
      details.message = `${details.message} (body statusCode ${source.statusCode})`.trim()
    }
    return details
  }

  const cloudflareCode = raw.match(CLOUDFLARE_ERROR_CODE)?.[1]
  const contentType = response.headers.get('content-type')?.split(';')[0].trim()
  details.name = cloudflareCode ? `cloudflare_${cloudflareCode}` : 'non_json_response'
  details.message = `non-JSON response (content-type: ${contentType && CONTENT_TYPE_PATTERN.test(contentType) ? contentType : 'none'})`
  if (cloudflareCode === '1010') {
    details.message += '; blocked before reaching Resend, usually a missing or rejected User-Agent header'
  }
  return details
}

function describeError({ status, name, message, rayId }) {
  return `HTTP ${status} ${name}${message ? `: ${message}` : ''}${rayId ? ` [cf-ray ${rayId}]` : ''}`
}

// Rate limits and server errors may succeed later; other client errors (bad key, unverified
// domain, invalid recipient) will not.
function isRetryableStatus(status) {
  return status === 429 || status >= 500
}

export async function sendEmail(message) {
  const template = message?.template ?? 'unknown'
  const invalid = validateMessage(message ?? {})
  if (invalid) {
    console.error(`Email not sent (template: ${template}): ${invalid}`)
    return { status: 'failed', reason: invalid, retryable: false }
  }

  const settings = getResendSettings()
  if (!settings) {
    console.warn(`Email skipped (template: ${template}): Resend is not configured`)
    return { status: 'skipped', reason: 'not_configured' }
  }

  const headers = {
    Authorization: `Bearer ${settings.apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  }
  if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey

  let response
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: settings.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: 'template', value: template }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? 'timeout' : 'network_error'
    console.error(`Email delivery failed (template: ${template}): ${reason}`)
    return { status: 'failed', reason, retryable: true }
  }

  if (!response.ok) {
    const details = await readErrorDetails(response, [settings.apiKey, message.to, message.subject])
    console.error(`Email delivery failed (template: ${template}): ${describeError(details)}`)
    return { status: 'failed', reason: `http_${response.status}`, retryable: isRetryableStatus(response.status) }
  }

  let id = null
  try {
    const body = await response.json()
    if (typeof body?.id === 'string') id = body.id
  } catch {
    // Accepted by Resend even if the body could not be read.
  }
  console.log(`Email sent (template: ${template}${id ? `, id: ${id}` : ''})`)
  return { status: 'sent', id }
}
