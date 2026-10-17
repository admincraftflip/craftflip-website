// Sender for every CraftFlip email. Not a secret, so it lives here rather than in an environment
// variable. Its domain must be verified in the Resend dashboard before mail can be delivered.
export const EMAIL_FROM = 'CraftFlip <hello@flip.thecraftaxis.com>'

export const RESEND_API_URL = 'https://api.resend.com/emails'

const API_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,}$/

let resendSettings = null
let initialized = false

function initResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('Resend not configured: missing RESEND_API_KEY (emails are skipped)')
    return null
  }
  // Only the shape is reported, never the key itself.
  if (!API_KEY_PATTERN.test(apiKey)) {
    console.error('Resend not configured: RESEND_API_KEY does not look like a Resend API key (emails are skipped)')
    return null
  }

  console.log('Resend configured')
  return { apiKey, from: EMAIL_FROM }
}

// Initialized lazily so it runs after dotenv has loaded backend/.env.
export function getResendSettings() {
  if (!initialized) {
    resendSettings = initResend()
    initialized = true
  }
  return resendSettings
}
