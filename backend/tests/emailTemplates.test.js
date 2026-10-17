import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  welcomeEmail,
  upgradeConfirmationEmail,
  paymentFailedEmail,
  escapeHtml,
  greetingName,
  EmailTemplateError,
} from '../utils/emailTemplates.js'

const DASHBOARD = 'https://flip.thecraftaxis.com/dashboard'

function assertComplete(email) {
  assert.equal(typeof email.subject, 'string')
  assert.ok(email.subject.length > 0 && !/[\r\n]/.test(email.subject))
  assert.match(email.html, /^<!doctype html>/)
  assert.match(email.html, /CraftFlip by The CraftAxis/)
  assert.ok(email.text.length > 0)
  assert.doesNotMatch(email.text, /<[a-z]/i, 'plain text has no markup')
}

test('welcome email renders the branded layout with greeting, button and plain text version', () => {
  const email = welcomeEmail({ displayName: 'Asif Iqbal', dashboardUrl: DASHBOARD })
  assertComplete(email)
  assert.equal(email.subject, 'Welcome to CraftFlip')
  assert.match(email.html, /Hi Asif,/)
  assert.match(email.html, /href="https:\/\/flip\.thecraftaxis\.com\/dashboard"/)
  assert.match(email.html, /Upload your first PDF/)
  assert.match(email.text, /Hi Asif,/)
  assert.match(email.text, /Upload your first PDF: https:\/\/flip\.thecraftaxis\.com\/dashboard/)
})

test('a missing or empty name falls back to a neutral greeting', () => {
  for (const displayName of [null, undefined, '', '   ', 42]) {
    const email = welcomeEmail({ displayName, dashboardUrl: DASHBOARD })
    assert.match(email.html, /Hi there,/)
    assert.match(email.text, /^Hi there,/)
  }
})

test('names and other values are HTML-escaped and tidied', () => {
  const email = welcomeEmail({ displayName: '<script>alert(1)</script>\r\nBcc: x', dashboardUrl: `${DASHBOARD}?a=1&b="2"` })
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /Hi &lt;script&gt;alert\(1\)&lt;\/script&gt;,/)
  assert.match(email.html, /href="https:\/\/flip\.thecraftaxis\.com\/dashboard\?a=1&amp;b=%222%22"/)
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;')
  assert.equal(greetingName('  Ana\u0000 Maria  '), 'Ana')
  assert.equal(greetingName('x'.repeat(500)).length, 80)
})

test('template links must be absolute http or https addresses without credentials', () => {
  for (const dashboardUrl of ['javascript:alert(1)', '/dashboard', '', 'data:text/html,hi', 'https://user:pass@example.com', undefined]) {
    assert.throws(() => welcomeEmail({ displayName: 'A', dashboardUrl }), EmailTemplateError, String(dashboardUrl))
  }
  assert.doesNotThrow(() => welcomeEmail({ displayName: 'A', dashboardUrl: 'http://localhost:5173/dashboard' }))
})

test('upgrade confirmation names the plan', () => {
  for (const [plan, name] of [['starter', 'Starter'], ['pro', 'Pro']]) {
    const email = upgradeConfirmationEmail({ displayName: 'Asif', plan, dashboardUrl: DASHBOARD })
    assertComplete(email)
    assert.equal(email.subject, `Your CraftFlip ${name} plan is active`)
    assert.match(email.html, new RegExp(`CraftFlip ${name} plan`))
  }
})

test('payment failure notice names the plan and links to the billing address given', () => {
  const email = paymentFailedEmail({ displayName: 'Asif', plan: 'pro', billingUrl: 'https://flip.thecraftaxis.com/dashboard' })
  assertComplete(email)
  assert.equal(email.subject, "We couldn't process your CraftFlip Pro payment")
  assert.match(email.html, /Review payment details/)
  assert.match(email.text, /Review payment details: https:\/\/flip\.thecraftaxis\.com\/dashboard/)
})

test('plan templates refuse plans other than starter and pro', () => {
  for (const plan of ['free', 'enterprise', '', undefined, 'PRO']) {
    assert.throws(() => upgradeConfirmationEmail({ displayName: 'A', plan, dashboardUrl: DASHBOARD }), EmailTemplateError)
    assert.throws(() => paymentFailedEmail({ displayName: 'A', plan, billingUrl: DASHBOARD }), EmailTemplateError)
  }
})
