// Branded transactional email templates. Each template returns { subject, html, text } and never
// sends anything itself (see utils/email.js). Layout uses tables and inline styles, which is what
// email clients render reliably. Colours are the warm stone tones of the reader; replace them here
// when the final CraftFlip brand colours are decided (REFERENCE.md, "Decisions still pending").

export const EMAIL_THEME = {
  canvas: '#f5f5f4',
  card: '#ffffff',
  border: '#e7e5e4',
  ink: '#1c1917',
  body: '#44403c',
  muted: '#78716c',
  accent: '#1c1917',
  accentText: '#fafaf9',
  serif: "Georgia, 'Times New Roman', serif",
  sans: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

const PLAN_NAMES = { starter: 'Starter', pro: 'Pro' }
const MAX_NAME_LENGTH = 80

export class EmailTemplateError extends Error {}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Display names come from the identity provider. Control characters are removed, spaces collapsed
// and the length capped, so a name can never break the layout or the subject line.
export function greetingName(displayName) {
  if (typeof displayName !== 'string') return null
  const tidied = displayName.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!tidied) return null
  const firstName = tidied.split(' ')[0]
  return firstName.slice(0, MAX_NAME_LENGTH)
}

function requireWebUrl(value, field) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new EmailTemplateError(`${field} must be an absolute URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EmailTemplateError(`${field} must use http or https`)
  }
  if (url.username || url.password) throw new EmailTemplateError(`${field} must not contain credentials`)
  return url.href
}

function planName(plan) {
  const name = PLAN_NAMES[plan]
  if (!name) throw new EmailTemplateError('plan must be starter or pro')
  return name
}

function paragraphHtml(text) {
  return `<p style="margin:0 0 16px;font-family:${EMAIL_THEME.sans};font-size:16px;line-height:26px;color:${EMAIL_THEME.body};">${escapeHtml(text)}</p>`
}

function buttonHtml({ label, url }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td style="border-radius:999px;background:${EMAIL_THEME.accent};">
<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${EMAIL_THEME.sans};font-size:15px;font-weight:600;letter-spacing:0.2px;color:${EMAIL_THEME.accentText};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr>
</table>`
}

// The shared layout: CraftFlip wordmark, a white card with the heading, paragraphs, an optional
// button and a footnote, and a footer naming the sender.
export function renderLayout({ preheader, heading, greeting, paragraphs, button, footnote }) {
  const theme = EMAIL_THEME
  const greetingLine = greeting ? `Hi ${greeting},` : 'Hi there,'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${theme.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.canvas};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;font-family:${theme.serif};font-size:24px;letter-spacing:0.5px;color:${theme.ink};">CraftFlip</td></tr>
<tr><td style="background:${theme.card};border:1px solid ${theme.border};border-radius:16px;padding:40px 36px;">
<h1 style="margin:0 0 24px;font-family:${theme.serif};font-size:28px;line-height:36px;font-weight:normal;color:${theme.ink};">${escapeHtml(heading)}</h1>
${paragraphHtml(greetingLine)}
${paragraphs.map(paragraphHtml).join('\n')}
${button ? buttonHtml(button) : ''}
${footnote ? `<p style="margin:0;font-family:${theme.sans};font-size:14px;line-height:22px;color:${theme.muted};">${escapeHtml(footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${theme.sans};font-size:12px;line-height:18px;color:${theme.muted};">CraftFlip by The CraftAxis &middot; Dhaka, Bangladesh<br>You are receiving this email because of your CraftFlip account.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    greetingLine,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    '--',
    'CraftFlip by The CraftAxis, Dhaka, Bangladesh',
  ].join('\n')

  return { html, text }
}

export function welcomeEmail({ displayName, dashboardUrl }) {
  const url = requireWebUrl(dashboardUrl, 'dashboardUrl')
  const heading = 'Welcome to CraftFlip'
  return {
    subject: 'Welcome to CraftFlip',
    ...renderLayout({
      preheader: 'Turn your first PDF into a flipbook worth sharing.',
      heading,
      greeting: greetingName(displayName),
      paragraphs: [
        'Thank you for joining CraftFlip. Your account is ready.',
        'Upload a brochure, guide or catalogue as a PDF and CraftFlip turns it into an interactive flipbook with realistic page turns, your own branding and a link you can share anywhere.',
      ],
      button: { label: 'Upload your first PDF', url },
      footnote: 'If you did not create a CraftFlip account, you can ignore this email.',
    }),
  }
}

export function upgradeConfirmationEmail({ displayName, plan, dashboardUrl }) {
  const name = planName(plan)
  const url = requireWebUrl(dashboardUrl, 'dashboardUrl')
  return {
    subject: `Your CraftFlip ${name} plan is active`,
    ...renderLayout({
      preheader: `Your account now uses the ${name} plan.`,
      heading: `You are on CraftFlip ${name}`,
      greeting: greetingName(displayName),
      paragraphs: [
        `Thank you for upgrading. Your account now uses the CraftFlip ${name} plan, and its features are available straight away.`,
      ],
      button: { label: 'Go to your dashboard', url },
      footnote: 'You can see your current plan on your dashboard at any time.',
    }),
  }
}

export function paymentFailedEmail({ displayName, plan, billingUrl }) {
  const name = planName(plan)
  const url = requireWebUrl(billingUrl, 'billingUrl')
  return {
    subject: `We couldn't process your CraftFlip ${name} payment`,
    ...renderLayout({
      preheader: 'Please check your payment details.',
      heading: 'Your payment did not go through',
      greeting: greetingName(displayName),
      paragraphs: [
        `We couldn't process the latest payment for your CraftFlip ${name} plan.`,
        'Please check your payment details so your plan stays active.',
      ],
      button: { label: 'Review payment details', url },
      footnote: 'If you have already updated your payment details, you can ignore this email.',
    }),
  }
}
