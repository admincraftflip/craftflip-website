import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const moduleUrl = (path) => new URL(path, import.meta.url).href

const API_KEY = 're_test_secret_0123456789'
const state = { settings: { apiKey: API_KEY, from: 'CraftFlip <hello@flip.thecraftaxis.com>' } }

mock.module(moduleUrl('../config/resend.js'), {
  namedExports: { getResendSettings: () => state.settings, RESEND_API_URL: 'https://api.resend.com/emails' },
})

const { sendEmail } = await import('../utils/email.js')

const MESSAGE = {
  to: 'new.owner@example.com',
  subject: 'Welcome to CraftFlip',
  html: '<p>Private welcome body</p>',
  text: 'Private welcome body',
  template: 'welcome',
  idempotencyKey: 'welcome-email/6ad0d2d3a1fe9c5bd7ed9c97',
}

let logged
let fetchMock

function respondWith(status, body) {
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  state.settings = { apiKey: API_KEY, from: 'CraftFlip <hello@flip.thecraftaxis.com>' }
  logged = []
  for (const method of ['log', 'warn', 'error']) mock.method(console, method, (line) => logged.push(String(line)))
  fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch not stubbed')
  })
})

afterEach(() => {
  // Nothing private may ever appear in the logs.
  const logText = logged.join('\n')
  for (const secret of [API_KEY, MESSAGE.to, MESSAGE.subject, 'Private welcome body']) assert.ok(!logText.includes(secret), `logs contain ${secret}`)
  mock.restoreAll()
})

test('a successful delivery posts one message to Resend and returns its id', async () => {
  respondWith(200, { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })

  const result = await sendEmail(MESSAGE)

  assert.deepEqual(result, { status: 'sent', id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
  assert.equal(fetchMock.mock.callCount(), 1)
  const [url, init] = fetchMock.mock.calls[0].arguments
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, `Bearer ${API_KEY}`)
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.equal(init.headers['Idempotency-Key'], MESSAGE.idempotencyKey)
  assert.ok(init.signal instanceof AbortSignal, 'the request has a timeout')
  assert.deepEqual(JSON.parse(init.body), {
    from: 'CraftFlip <hello@flip.thecraftaxis.com>',
    to: ['new.owner@example.com'],
    subject: 'Welcome to CraftFlip',
    html: '<p>Private welcome body</p>',
    text: 'Private welcome body',
    tags: [{ name: 'template', value: 'welcome' }],
  })
  assert.match(logged.join('\n'), /Email sent \(template: welcome, id: 49a3999c/)
})

test('without Resend configuration nothing is sent and the result says skipped', async () => {
  state.settings = null
  const result = await sendEmail(MESSAGE)
  assert.deepEqual(result, { status: 'skipped', reason: 'not_configured' })
  assert.equal(fetchMock.mock.callCount(), 0)
  assert.match(logged.join('\n'), /Email skipped \(template: welcome\): Resend is not configured/)
})

test('client errors from Resend are permanent failures, rate limits and server errors are retryable', async () => {
  for (const [status, name, retryable] of [
    [401, 'missing_api_key', false],
    [403, 'validation_error', false],
    [422, 'validation_error', false],
    [429, 'rate_limit_exceeded', true],
    [500, 'internal_server_error', true],
    [503, 'application_error', true],
  ]) {
    respondWith(status, { statusCode: status, name, message: `Problem with ${MESSAGE.to}` })
    const result = await sendEmail(MESSAGE)
    assert.deepEqual(result, { status: 'failed', reason: `http_${status}`, retryable }, String(status))
  }
  assert.match(logged.join('\n'), /Email delivery failed \(template: welcome\): HTTP 422 validation_error/)
})

test('network errors and timeouts are retryable failures and never throw', async () => {
  fetchMock.mock.mockImplementation(async () => {
    throw new TypeError('fetch failed')
  })
  assert.deepEqual(await sendEmail(MESSAGE), { status: 'failed', reason: 'network_error', retryable: true })

  fetchMock.mock.mockImplementation(async () => {
    throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  })
  assert.deepEqual(await sendEmail(MESSAGE), { status: 'failed', reason: 'timeout', retryable: true })
})

test('a non-JSON error body is still reported as a failure, without its content', async () => {
  fetchMock.mock.mockImplementation(
    async () => new Response('<html>Bad gateway for new.owner@example.com</html>', { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  )
  assert.deepEqual(await sendEmail(MESSAGE), { status: 'failed', reason: 'http_502', retryable: true })
  assert.match(logged.join('\n'), /HTTP 502 non_json_response: non-JSON response \(content-type: text\/html\)$/)
  assert.ok(!logged.join('\n').includes('Bad gateway'))
})

test('the logged failure carries Resend\'s error name, message and status, redacted', async () => {
  respondWith(403, {
    statusCode: 403,
    name: 'validation_error',
    message: `The flip.thecraftaxis.com domain is not verified. Sent to ${MESSAGE.to} with "${MESSAGE.subject}" using ${API_KEY}.\r\nInjected line`,
  })

  assert.deepEqual(await sendEmail(MESSAGE), { status: 'failed', reason: 'http_403', retryable: false })
  const line = logged.find((entry) => entry.startsWith('Email delivery failed'))
  assert.equal(
    line,
    'Email delivery failed (template: welcome): HTTP 403 validation_error: The flip.thecraftaxis.com domain is not verified. Sent to [redacted] with "[redacted]" using [redacted]. Injected line',
  )
  assert.ok(!line.includes(MESSAGE.subject))
})

test('the testing-mode 403 is reported by name with the address removed', async () => {
  respondWith(403, {
    statusCode: 403,
    name: 'validation_error',
    message: 'You can only send testing emails to your own email address (someone.else@gmail.com).',
  })
  await sendEmail(MESSAGE)
  assert.match(logged.join('\n'), /HTTP 403 validation_error: You can only send testing emails to your own email address \(\[address\]\)\.$/m)
  assert.ok(!logged.join('\n').includes('someone.else@gmail.com'))
})

test('a Cloudflare 1010 block is named and explained, with the ray id', async () => {
  fetchMock.mock.mockImplementation(
    async () => new Response('error code: 1010', { status: 403, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'cf-ray': '8f1e2d3c4b5a6978-SIN' } }),
  )
  assert.deepEqual(await sendEmail(MESSAGE), { status: 'failed', reason: 'http_403', retryable: false })
  assert.match(
    logged.join('\n'),
    /HTTP 403 cloudflare_1010: non-JSON response \(content-type: text\/plain\); blocked before reaching Resend, usually a missing or rejected User-Agent header \[cf-ray 8f1e2d3c4b5a6978-SIN\]/,
  )
})

test('nested error bodies, unsafe names and a mismatched body status are handled', async () => {
  respondWith(403, { error: { name: 'restricted_api_key', message: 'API key is not active', statusCode: 401 } })
  await sendEmail(MESSAGE)
  respondWith(403, { name: 'bad name\nforged', message: 42 })
  await sendEmail(MESSAGE)
  const lines = logged.filter((entry) => entry.startsWith('Email delivery failed'))
  assert.deepEqual(lines, [
    'Email delivery failed (template: welcome): HTTP 403 restricted_api_key: API key is not active (body statusCode 401)',
    'Email delivery failed (template: welcome): HTTP 403 unknown',
  ])
})

test('every request names the client with a User-Agent header', async () => {
  respondWith(200, { id: 'abc' })
  await sendEmail(MESSAGE)
  assert.match(fetchMock.mock.calls[0].arguments[1].headers['User-Agent'], /^CraftFlip\/1\.0 /)
})

test('invalid messages are refused before any request', async () => {
  const cases = [
    [{ to: 'not-an-address' }, 'invalid_recipient'],
    [{ to: 'a@example.com\r\nBcc: victim@example.com' }, 'invalid_recipient'],
    [{ to: ['a@example.com', 'b@example.com'] }, 'invalid_recipient'],
    [{ subject: 'Hello\r\nBcc: victim@example.com' }, 'invalid_subject'],
    [{ subject: '   ' }, 'invalid_subject'],
    [{ html: '' }, 'invalid_body'],
    [{ text: undefined }, 'invalid_body'],
    [{ template: 'has spaces' }, 'invalid_template'],
    [{ idempotencyKey: 'x'.repeat(257) }, 'invalid_idempotency_key'],
  ]
  for (const [override, reason] of cases) {
    assert.deepEqual(await sendEmail({ ...MESSAGE, ...override }), { status: 'failed', reason, retryable: false }, reason)
  }
  assert.deepEqual(await sendEmail(undefined), { status: 'failed', reason: 'invalid_recipient', retryable: false })
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('the idempotency header is left out when no key is given', async () => {
  respondWith(200, { id: 'abc' })
  const { idempotencyKey, ...withoutKey } = MESSAGE
  assert.equal(idempotencyKey.length > 0, true)
  await sendEmail(withoutKey)
  assert.equal('Idempotency-Key' in fetchMock.mock.calls[0].arguments[1].headers, false)
})
