import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Each case imports its own copy of the module (a distinct query string), because the settings
// are read once per process.
async function loadWith(apiKey, label) {
  if (apiKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = apiKey
  const logged = []
  for (const method of ['log', 'warn', 'error']) mock.method(console, method, (line) => logged.push(line))
  try {
    const { getResendSettings } = await import(`../config/resend.js?${label}`)
    return { settings: getResendSettings(), logged }
  } finally {
    mock.restoreAll()
    delete process.env.RESEND_API_KEY
  }
}

test('without RESEND_API_KEY the settings are null and the log says emails are skipped', async () => {
  const { settings, logged } = await loadWith(undefined, 'missing')
  assert.equal(settings, null)
  assert.match(logged.join('\n'), /Resend not configured: missing RESEND_API_KEY/)
})

test('an empty or malformed key is treated as not configured and never logged', async () => {
  const blank = await loadWith('   ', 'blank')
  assert.equal(blank.settings, null)
  assert.match(blank.logged.join('\n'), /missing RESEND_API_KEY/)

  const malformed = await loadWith('sk_live_not_resend_123456', 'malformed')
  assert.equal(malformed.settings, null)
  assert.match(malformed.logged.join('\n'), /does not look like a Resend API key/)
  assert.ok(!malformed.logged.join('\n').includes('sk_live_not_resend_123456'), 'the key is not logged')
})

test('a valid key is used with the CraftFlip sender and is not logged', async () => {
  const apiKey = 're_test_0123456789abcdef'
  const { settings, logged } = await loadWith(apiKey, 'valid')
  assert.equal(settings.apiKey, apiKey)
  assert.match(settings.from, /^CraftFlip <[^>]+@[^>]+>$/)
  assert.deepEqual(logged, ['Resend configured'])
})
