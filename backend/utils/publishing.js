import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import Flipbook from '../models/Flipbook.js'
import PublishedSlug from '../models/PublishedSlug.js'
import User from '../models/User.js'
import { generateSlug } from './slug.js'
import { maxPublishedForPlan } from './planLimits.js'

const DUPLICATE_KEY_ERROR = 11000
// A publish takes a few database round trips; the lease only matters if the server dies holding it.
const LOCK_LEASE_MS = 15 * 1000
const LOCK_WAIT_MS = 10 * 1000
const LOCK_RETRY_MS = 100
const MAX_SLUG_ATTEMPTS = 5
const PLAN_NAMES = { free: 'Free', starter: 'Starter', pro: 'Pro' }
const OWNER_FIELDS = { pages: 0, pdfAsset: 0 }

// An error whose status and message are safe to send to the client.
// details are extra safe fields for the response (for example requiresConfirmation).
export class PublishError extends Error {
  constructor(status, message, details = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const PUBLISH_MESSAGES = {
  notFound: 'Flipbook not found.',
  notReady: 'Only converted flipbooks can be published.',
  deleting: 'This flipbook is being deleted.',
  busy: 'Another publish request is still running. Please try again.',
  changed: 'This flipbook changed while it was being published. Please try again.',
  slugTaken: 'That link is not available. Please choose another.',
  slugChanged: 'This flipbook changed while its link was being updated. Please try again.',
  confirmSlugChange: 'This flipbook has been published before. Changing its link permanently breaks the old link, which will never be used again. Confirm to continue.',
}

export function planLimitMessage(plan, limit) {
  const planName = PLAN_NAMES[plan] ?? 'Free'
  return `Your ${planName} plan allows ${limit} published flipbooks at a time. Unpublish or delete one to publish this flipbook.`
}

// One publish at a time per user, across requests and server instances: a lease on the user
// document. Counting published flipbooks and publishing happen while it is held, so two
// simultaneous publishes cannot both see a free slot. Unpublish and delete only free slots and
// do not take it.
async function acquirePublishLock(userId) {
  const token = randomUUID()
  const giveUpAt = Date.now() + LOCK_WAIT_MS
  for (;;) {
    const now = new Date()
    const locked = await User.findOneAndUpdate(
      { _id: userId, $or: [{ 'publishLock.expiresAt': null }, { 'publishLock.expiresAt': { $lte: now } }] },
      { $set: { publishLock: { token, expiresAt: new Date(now.getTime() + LOCK_LEASE_MS) } } },
      { projection: { _id: 1 } }
    )
    if (locked) return token
    if (Date.now() >= giveUpAt) throw new PublishError(409, PUBLISH_MESSAGES.busy)
    await sleep(LOCK_RETRY_MS)
  }
}

async function releasePublishLock(userId, token) {
  try {
    await User.updateOne({ _id: userId, 'publishLock.token': token }, { $set: { publishLock: { token: null, expiresAt: null } } })
  } catch (error) {
    // The lease expires on its own; the user can publish again after LOCK_LEASE_MS.
    console.error(`Publish lock release failed: ${error.name}`)
  }
}

// True if a slug was ever published (by any flipbook, including deleted ones).
export async function isSlugRetired(slug) {
  return Boolean(await PublishedSlug.exists({ slug }))
}

// Before its first publish a flipbook may change slug freely (Slug rules), so a slug that an
// earlier, deleted flipbook already published is replaced rather than reused.
async function replaceSlug(flipbook, currentSlug) {
  const nextSlug = generateSlug(flipbook.title)
  try {
    const updated = await Flipbook.findOneAndUpdate(
      { _id: flipbook._id, slug: currentSlug, firstPublishedAt: null },
      { $set: { slug: nextSlug } },
      { projection: { _id: 1 } }
    )
    if (!updated) throw new PublishError(409, PUBLISH_MESSAGES.changed)
    return nextSlug
  } catch (error) {
    // Another live flipbook has that slug already; the caller tries again with a new one.
    if (error.code === DUPLICATE_KEY_ERROR) return currentSlug
    throw error
  }
}

// Reserves the flipbook's slug in the registry (an upsert on the unique slug index, so two
// flipbooks can never hold the same reservation) and returns the slug to publish under.
async function reserveSlug(flipbook) {
  let slug = flipbook.slug
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    let reservation
    try {
      reservation = await PublishedSlug.findOneAndUpdate(
        { slug },
        { $setOnInsert: { slug, flipbookId: flipbook._id } },
        { upsert: true, returnDocument: 'after' }
      )
    } catch (error) {
      // Two upserts of the same new slug raced; the next attempt reads the winner.
      if (error.code === DUPLICATE_KEY_ERROR) continue
      throw error
    }
    if (String(reservation.flipbookId) === String(flipbook._id)) return slug
    if (flipbook.firstPublishedAt) throw new Error('A published slug is registered to another flipbook')
    slug = await replaceSlug(flipbook, slug)
  }
  throw new Error('Could not reserve a slug')
}

// Publishes the user's own Ready flipbook. Idempotent: publishing a published flipbook returns it.
export async function publishFlipbook(user, flipbookId) {
  const token = await acquirePublishLock(user._id)
  try {
    const flipbook = await Flipbook.findOne({ _id: flipbookId, ownerId: user._id }).select(OWNER_FIELDS)
    if (!flipbook) throw new PublishError(404, PUBLISH_MESSAGES.notFound)
    if (flipbook.status === 'deleting') throw new PublishError(409, PUBLISH_MESSAGES.deleting)
    if (flipbook.status !== 'ready') throw new PublishError(409, PUBLISH_MESSAGES.notReady)
    if (flipbook.isPublished) return flipbook

    const limit = maxPublishedForPlan(user.plan)
    if (Number.isFinite(limit)) {
      const publishedCount = await Flipbook.countDocuments({ ownerId: user._id, isPublished: true, status: 'ready' })
      if (publishedCount >= limit) throw new PublishError(403, planLimitMessage(user.plan, limit))
    }

    const firstPublish = !flipbook.firstPublishedAt
    const slug = await reserveSlug(flipbook)
    const now = new Date()
    const published = await Flipbook.findOneAndUpdate(
      { _id: flipbook._id, ownerId: user._id, status: 'ready', slug, ...(firstPublish ? { firstPublishedAt: null } : {}) },
      { $set: { isPublished: true, publishedAt: now, ...(firstPublish ? { firstPublishedAt: now } : {}) } },
      { returnDocument: 'after', projection: OWNER_FIELDS }
    )
    if (!published) {
      // Deleted or changed meanwhile. A slug that never went public is released again; this is
      // safe because no other publish of this user's flipbooks can run while the lock is held.
      if (firstPublish) await PublishedSlug.deleteOne({ slug, flipbookId: flipbook._id })
      throw new PublishError(409, PUBLISH_MESSAGES.changed)
    }
    return published
  } finally {
    await releasePublishLock(user._id, token)
  }
}

// Stops public access from the next request on. Idempotent; the slug is kept for republishing.
export async function unpublishFlipbook(user, flipbookId) {
  const unpublished = await Flipbook.findOneAndUpdate(
    { _id: flipbookId, ownerId: user._id, isPublished: true },
    { $set: { isPublished: false, unpublishedAt: new Date() } },
    { returnDocument: 'after', projection: OWNER_FIELDS }
  )
  if (unpublished) return unpublished
  const existing = await Flipbook.findOne({ _id: flipbookId, ownerId: user._id }).select(OWNER_FIELDS)
  if (!existing) throw new PublishError(404, PUBLISH_MESSAGES.notFound)
  return existing
}

export async function publishedCountFor(userId) {
  return Flipbook.countDocuments({ ownerId: userId, isPublished: true, status: 'ready' })
}

// Changes the flipbook's public link (Slug rules): freely before its first publish; after that only
// with confirmed set, because the old link stops working. The old slug, once published, stays in
// the registry for good, so it never leads to another flipbook. A slug published by a different
// flipbook, or used by another live flipbook, is refused. Runs under the publish lease, so it
// cannot interleave with a publish of the same user's flipbooks.
export async function changeSlug(user, flipbookId, slug, { confirmed = false } = {}) {
  const token = await acquirePublishLock(user._id)
  try {
    const flipbook = await Flipbook.findOne({ _id: flipbookId, ownerId: user._id }).select(OWNER_FIELDS)
    if (!flipbook) throw new PublishError(404, PUBLISH_MESSAGES.notFound)
    if (flipbook.status === 'deleting') throw new PublishError(409, PUBLISH_MESSAGES.deleting)
    if (flipbook.slug === slug) return flipbook
    if (flipbook.firstPublishedAt && !confirmed) {
      throw new PublishError(409, PUBLISH_MESSAGES.confirmSlugChange, { requiresConfirmation: true })
    }

    const reservation = await PublishedSlug.findOne({ slug }).select('flipbookId')
    if (reservation && String(reservation.flipbookId) !== String(flipbook._id)) throw new PublishError(409, PUBLISH_MESSAGES.slugTaken)

    // A published flipbook's new link is public the moment it is saved, so it is reserved first.
    if (flipbook.isPublished && flipbook.status === 'ready' && !reservation) {
      try {
        await PublishedSlug.create({ slug, flipbookId: flipbook._id })
      } catch (error) {
        if (error.code === DUPLICATE_KEY_ERROR) throw new PublishError(409, PUBLISH_MESSAGES.slugTaken)
        throw error
      }
    }

    let updated
    try {
      updated = await Flipbook.findOneAndUpdate(
        { _id: flipbook._id, ownerId: user._id, slug: flipbook.slug, status: { $ne: 'deleting' } },
        { $set: { slug } },
        { returnDocument: 'after', projection: OWNER_FIELDS }
      )
    } catch (error) {
      // Another live flipbook already uses this slug (unique index).
      if (error.code === DUPLICATE_KEY_ERROR) throw new PublishError(409, PUBLISH_MESSAGES.slugTaken)
      throw error
    }
    if (!updated) throw new PublishError(409, PUBLISH_MESSAGES.slugChanged)
    return updated
  } finally {
    await releasePublishLock(user._id, token)
  }
}
