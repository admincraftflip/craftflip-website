import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import express from 'express'
import { createFakeCollection } from './helpers/fakeCollection.js'
import { startServer } from './helpers/server.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

// The User model is an in-memory collection whose operations interleave like real ones, so
// simultaneous sign-ins race exactly where they could against MongoDB.
let users
let nextId = 1
const userModel = {
  findOneAndUpdate: (filter, update, options) => {
    const withId = options?.upsert ? { ...update, $setOnInsert: { _id: `user-${nextId++}`, ...update.$setOnInsert } } : update
    return users.findOneAndUpdate(filter, withId, options)
  },
  updateOne: (filter, update) => users.updateOne(filter, update),
}

const delivery = { sendEmail: mock.fn(async () => ({ status: 'sent', id: 'resend-id' })) }
const tokens = new Map()

mock.module(moduleUrl('../models/User.js'), { defaultExport: userModel })
mock.module(moduleUrl('../utils/email.js'), { namedExports: { sendEmail: (...args) => delivery.sendEmail(...args) } })
mock.module(moduleUrl('../config/firebaseAdmin.js'), {
  namedExports: {
    getFirebaseAuth: () => ({
      verifyIdToken: async (token) => {
        if (!tokens.has(token)) throw new Error('invalid token')
        return tokens.get(token)
      },
    }),
  },
})

const { sendWelcomeEmailIfDue, scheduleWelcomeEmail, MAX_ATTEMPTS, CLAIM_LEASE_MS } = await import('../utils/welcomeEmail.js')
const { requireAuth } = await import('../middleware/requireAuth.js')

const app = express()
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ success: true, data: { user: { id: req.user._id } } }))
const server = await startServer(app)
test.after(() => server.close())

const logged = []

beforeEach(() => {
  users = createFakeCollection({ uniqueFields: ['firebaseUid'] })
  tokens.clear()
  delivery.sendEmail.mock.resetCalls()
  delivery.sendEmail.mock.mockImplementation(async () => ({ status: 'sent', id: 'resend-id' }))
  logged.length = 0
  for (const method of ['log', 'warn', 'error']) mock.method(console, method, (line) => logged.push(String(line)))
  process.env.CLIENT_URL = 'https://flip.thecraftaxis.com'
})

function addUser(fields) {
  // A snapshot, like a document a request read earlier: later writes do not change it.
  return structuredClone(users.insert({ _id: `user-${nextId++}`, firebaseUid: `uid-${nextId}`, email: 'owner@example.com', displayName: 'Asif Iqbal', ...fields }))
}

function welcomeState(id) {
  return users.documents.find((user) => user._id === id).welcomeEmail
}

async function settled() {
  for (let index = 0; index < 50; index += 1) await nextTick()
}

function signIn(token) {
  return fetch(`${server.url}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
}

test('a new account is sent one welcome email with the dashboard link and a per-user idempotency key', async () => {
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  const now = new Date('2026-10-17T10:00:00Z')

  assert.equal(await sendWelcomeEmailIfDue(user, { now }), 'sent')

  assert.equal(delivery.sendEmail.mock.callCount(), 1)
  const message = delivery.sendEmail.mock.calls[0].arguments[0]
  assert.equal(message.to, 'owner@example.com')
  assert.equal(message.template, 'welcome')
  assert.equal(message.idempotencyKey, `welcome-email/${user._id}`)
  assert.equal(message.subject, 'Welcome to CraftFlip')
  assert.match(message.html, /href="https:\/\/flip\.thecraftaxis\.com\/dashboard"/)
  assert.match(message.text, /Hi Asif,/)
  assert.deepEqual(welcomeState(user._id), { status: 'sent', attempts: 0, nextAttemptAt: null, sentAt: now })
})

test('a welcome email already sent is never sent again', async () => {
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  await sendWelcomeEmailIfDue(user)
  const stored = users.documents.find((candidate) => candidate._id === user._id)

  assert.equal(await sendWelcomeEmailIfDue(structuredClone(stored)), 'not_eligible')
  // Even a caller holding an outdated copy (still pending) cannot claim it again.
  assert.equal(await sendWelcomeEmailIfDue(user), 'not_claimed')
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
})

test('accounts created before Milestone 12 (no welcome state) never receive a welcome email', async () => {
  for (const fields of [{}, { welcomeEmail: { status: null } }, { welcomeEmail: { status: 'skipped' } }, { welcomeEmail: { status: 'failed' } }]) {
    const user = addUser(fields)
    assert.equal(await sendWelcomeEmailIfDue(user), 'not_eligible')
  }
  assert.equal(delivery.sendEmail.mock.callCount(), 0)
})

test('simultaneous requests for the same new account send exactly one email', async () => {
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => sendWelcomeEmailIfDue(structuredClone(user))))
  assert.deepEqual(outcomes.toSorted(), ['not_claimed', 'not_claimed', 'not_claimed', 'not_claimed', 'not_claimed', 'sent'])
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
})

test('an account without an email address is skipped for good', async () => {
  const user = addUser({ email: null, welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  assert.equal(await sendWelcomeEmailIfDue(user), 'skipped')
  assert.equal(delivery.sendEmail.mock.callCount(), 0)
  assert.equal(welcomeState(user._id).status, 'skipped')
})

test('missing Resend configuration skips the welcome email without retrying later', async () => {
  delivery.sendEmail.mock.mockImplementation(async () => ({ status: 'skipped', reason: 'not_configured' }))
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  assert.equal(await sendWelcomeEmailIfDue(user), 'skipped')
  assert.equal(welcomeState(user._id).status, 'skipped')
  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date(Date.now() + 2 * CLAIM_LEASE_MS) }), 'not_claimed')
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
})

test('a retryable failure waits for the lease, then retries with the same idempotency key, up to the attempt limit', async () => {
  delivery.sendEmail.mock.mockImplementation(async () => ({ status: 'failed', reason: 'http_500', retryable: true }))
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  let now = new Date('2026-10-17T10:00:00Z')

  assert.equal(await sendWelcomeEmailIfDue(user, { now }), 'retry')
  assert.equal(welcomeState(user._id).status, 'pending')
  assert.equal(welcomeState(user._id).attempts, 1)
  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date(now.getTime() + 60_000) }), 'not_claimed', 'no retry before the lease ends')

  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
    now = new Date(now.getTime() + CLAIM_LEASE_MS)
    const outcome = await sendWelcomeEmailIfDue(user, { now })
    assert.equal(outcome, attempt < MAX_ATTEMPTS ? 'retry' : 'failed')
  }
  assert.equal(welcomeState(user._id).status, 'failed')
  assert.equal(welcomeState(user._id).attempts, MAX_ATTEMPTS)
  assert.equal(delivery.sendEmail.mock.callCount(), MAX_ATTEMPTS)
  const keys = new Set(delivery.sendEmail.mock.calls.map((call) => call.arguments[0].idempotencyKey))
  assert.deepEqual([...keys], [`welcome-email/${user._id}`])

  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date(now.getTime() + 10 * CLAIM_LEASE_MS) }), 'not_claimed')
  assert.equal(delivery.sendEmail.mock.callCount(), MAX_ATTEMPTS)
})

test('a retry that succeeds marks the email as sent', async () => {
  let calls = 0
  delivery.sendEmail.mock.mockImplementation(async () => (calls++ === 0 ? { status: 'failed', reason: 'timeout', retryable: true } : { status: 'sent', id: 'x' }))
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  const now = new Date('2026-10-17T10:00:00Z')
  assert.equal(await sendWelcomeEmailIfDue(user, { now }), 'retry')
  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date(now.getTime() + CLAIM_LEASE_MS) }), 'sent')
  assert.equal(welcomeState(user._id).status, 'sent')
})

test('a permanent failure (for example an unverified sender domain) is not retried', async () => {
  delivery.sendEmail.mock.mockImplementation(async () => ({ status: 'failed', reason: 'http_403', retryable: false }))
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  assert.equal(await sendWelcomeEmailIfDue(user), 'failed')
  assert.equal(welcomeState(user._id).status, 'failed')
  assert.equal(welcomeState(user._id).attempts, 1)
  assert.equal(welcomeState(user._id).nextAttemptAt, null)
  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date(Date.now() + 10 * CLAIM_LEASE_MS) }), 'not_claimed')
})

test('a send interrupted mid-way (left as sending) is claimed again only after its lease expires', async () => {
  const leaseEnd = new Date('2026-10-17T10:15:00Z')
  const user = addUser({ welcomeEmail: { status: 'sending', attempts: 0, nextAttemptAt: leaseEnd } })
  assert.equal(await sendWelcomeEmailIfDue(user, { now: new Date('2026-10-17T10:05:00Z') }), 'not_claimed')
  assert.equal(await sendWelcomeEmailIfDue(user, { now: leaseEnd }), 'sent')
  assert.equal(delivery.sendEmail.mock.calls[0].arguments[0].idempotencyKey, `welcome-email/${user._id}`)
})

test('an invalid CLIENT_URL fails the welcome email without sending or throwing', async () => {
  process.env.CLIENT_URL = ''
  const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
  assert.equal(await sendWelcomeEmailIfDue(user), 'failed')
  assert.equal(delivery.sendEmail.mock.callCount(), 0)
  assert.match(logged.join('\n'), /check CLIENT_URL/)
})

test('scheduleWelcomeEmail swallows database and delivery errors, synchronous or not', async () => {
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    delivery.sendEmail.mock.mockImplementation(async () => {
      throw new Error('unexpected')
    })
    const user = addUser({ welcomeEmail: { status: 'pending', attempts: 0, nextAttemptAt: null } })
    assert.doesNotThrow(() => scheduleWelcomeEmail(user))

    const original = userModel.findOneAndUpdate
    userModel.findOneAndUpdate = () => {
      throw new Error('database down')
    }
    try {
      assert.doesNotThrow(() => scheduleWelcomeEmail(addUser({ welcomeEmail: { status: 'pending' } })))
    } finally {
      userModel.findOneAndUpdate = original
    }
    assert.doesNotThrow(() => scheduleWelcomeEmail(null))
    await settled()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
  assert.deepEqual(unhandled, [])
  assert.match(logged.join('\n'), /Welcome email check failed/)
})

test('first sign-in creates the account as pending and sends the welcome email once; later sign-ins do not', async () => {
  tokens.set('token-a', { uid: 'firebase-a', email: 'new.owner@example.com', name: 'New Owner' })

  const first = await signIn('token-a')
  assert.equal(first.status, 200)
  await settled()
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
  assert.equal(delivery.sendEmail.mock.calls[0].arguments[0].to, 'new.owner@example.com')

  for (let index = 0; index < 3; index += 1) assert.equal((await signIn('token-a')).status, 200)
  await settled()
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
  assert.equal(users.documents.length, 1)
  assert.equal(users.documents[0].welcomeEmail.status, 'sent')
})

test('simultaneous first sign-ins create one account and send one welcome email', async () => {
  tokens.set('token-b', { uid: 'firebase-b', email: 'b@example.com' })
  const responses = await Promise.all(Array.from({ length: 5 }, () => signIn('token-b')))
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200])
  await settled()
  assert.equal(users.documents.length, 1)
  assert.equal(delivery.sendEmail.mock.callCount(), 1)
})

test('an existing account signing in is never sent a welcome email', async () => {
  users.insert({ _id: 'legacy-user', firebaseUid: 'firebase-legacy', email: 'legacy@example.com' })
  tokens.set('token-legacy', { uid: 'firebase-legacy', email: 'legacy@example.com' })
  assert.equal((await signIn('token-legacy')).status, 200)
  await settled()
  assert.equal(delivery.sendEmail.mock.callCount(), 0)
  assert.equal(users.documents[0].welcomeEmail, undefined)
})

test('email failures never break sign-up: delivery errors, exceptions and a slow provider', async () => {
  const outcomes = [
    async () => ({ status: 'failed', reason: 'http_500', retryable: true }),
    async () => ({ status: 'skipped', reason: 'not_configured' }),
    async () => {
      throw new Error('provider exploded')
    },
    () => new Promise(() => {}),
  ]
  for (const [index, implementation] of outcomes.entries()) {
    delivery.sendEmail.mock.mockImplementation(implementation)
    tokens.set(`token-${index}`, { uid: `firebase-fail-${index}`, email: `fail${index}@example.com` })
    const started = Date.now()
    const response = await signIn(`token-${index}`)
    assert.equal(response.status, 200, `case ${index}`)
    assert.equal((await response.json()).success, true)
    assert.ok(Date.now() - started < 2000, 'sign-in does not wait for the email')
  }
  await settled()
})
