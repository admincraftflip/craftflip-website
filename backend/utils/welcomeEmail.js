import User from '../models/User.js'
import { sendEmail } from './email.js'
import { welcomeEmail } from './emailTemplates.js'

// The welcome email is sent once per account, after its first successful sign-in.
//
// Only users created since Milestone 12 are eligible: the sign-in upsert sets welcomeEmail.status
// to pending on insert only, so accounts that existed before (status null) never receive one.
// Every authenticated request may call scheduleWelcomeEmail, but the email is sent only by the
// request that atomically claims the pending state, so repeat and simultaneous sign-ins cannot
// send it twice. The claim is a lease: if the server stops mid-send, a later sign-in may claim it
// again after the lease, and the per-user Idempotency-Key lets Resend drop the duplicate (keys are
// kept for 24 hours). A retryable failure is retried on a later request, at most MAX_ATTEMPTS
// times in all; permanent failures and missing configuration end the attempt for good.

export const MAX_ATTEMPTS = 3
export const CLAIM_LEASE_MS = 15 * 60 * 1000
const CLAIMABLE = ['pending', 'sending']

function isEligible(user) {
  return CLAIMABLE.includes(user?.welcomeEmail?.status)
}

async function claim(userId, now) {
  return User.findOneAndUpdate(
    {
      _id: userId,
      'welcomeEmail.status': { $in: CLAIMABLE },
      $or: [{ 'welcomeEmail.nextAttemptAt': null }, { 'welcomeEmail.nextAttemptAt': { $lte: now } }],
    },
    { $set: { 'welcomeEmail.status': 'sending', 'welcomeEmail.nextAttemptAt': new Date(now.getTime() + CLAIM_LEASE_MS) } },
    { returnDocument: 'after' }
  )
}

function settle(userId, fields) {
  return User.updateOne(
    { _id: userId, 'welcomeEmail.status': 'sending' },
    { $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`welcomeEmail.${key}`, value])) }
  )
}

function dashboardUrl() {
  return new URL('/dashboard', process.env.CLIENT_URL).href
}

// Returns the outcome for tests and logs: 'not_eligible', 'not_claimed', 'sent', 'skipped',
// 'retry' or 'failed'. Never throws for delivery problems.
export async function sendWelcomeEmailIfDue(user, { now = new Date() } = {}) {
  if (!isEligible(user)) return 'not_eligible'

  const claimed = await claim(user._id, now)
  if (!claimed) return 'not_claimed'

  if (!claimed.email) {
    await settle(user._id, { status: 'skipped', nextAttemptAt: null })
    console.log(`Welcome email skipped for user ${user._id}: no email address`)
    return 'skipped'
  }

  let message
  try {
    message = welcomeEmail({ displayName: claimed.displayName, dashboardUrl: dashboardUrl() })
  } catch (error) {
    await settle(user._id, { status: 'failed', nextAttemptAt: null })
    console.error(`Welcome email not sent for user ${user._id}: ${error.name} (check CLIENT_URL)`)
    return 'failed'
  }

  const result = await sendEmail({
    to: claimed.email,
    template: 'welcome',
    idempotencyKey: `welcome-email/${user._id}`,
    ...message,
  })

  if (result.status === 'sent') {
    await settle(user._id, { status: 'sent', sentAt: now, nextAttemptAt: null })
    return 'sent'
  }
  if (result.status === 'skipped') {
    await settle(user._id, { status: 'skipped', nextAttemptAt: null })
    return 'skipped'
  }

  const attempts = (claimed.welcomeEmail?.attempts ?? 0) + 1
  if (result.retryable && attempts < MAX_ATTEMPTS) {
    // The lease set by the claim doubles as the wait before the next attempt.
    await settle(user._id, { status: 'pending', attempts })
    return 'retry'
  }
  await settle(user._id, { status: 'failed', attempts, nextAttemptAt: null })
  console.error(`Welcome email given up for user ${user._id} after ${attempts} attempt(s)`)
  return 'failed'
}

// Fire and forget from the auth middleware: the request never waits for the email, and nothing
// that goes wrong here (database or delivery) can reach the request.
export function scheduleWelcomeEmail(user) {
  if (!isEligible(user)) return
  try {
    sendWelcomeEmailIfDue(user).catch((error) => {
      console.error(`Welcome email check failed for user ${user._id}: ${error?.name ?? 'Error'}`)
    })
  } catch (error) {
    console.error(`Welcome email check failed for user ${user._id}: ${error?.name ?? 'Error'}`)
  }
}
