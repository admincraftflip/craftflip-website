import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import Flipbook from '../models/Flipbook.js'
import { getCloudinary } from '../config/cloudinary.js'
import { deleteSocialImage, fetchPageImage, socialFolder, uploadSocialImage } from './pdfStorage.js'

// Social preview image (Milestone 13): the first page of a converted flipbook on a 1200x630 card,
// the size Facebook, LinkedIn, WhatsApp and X use for large link previews. Made once per
// flipbook, stored privately and served only through the public API while the flipbook is
// published. See REFERENCE.md, "Social previews (Milestone 13)".
export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630
// Some apps (WhatsApp in particular) skip preview images much larger than this.
const MAX_SOCIAL_IMAGE_BYTES = 300 * 1024
// Tried in order until the image fits within MAX_SOCIAL_IMAGE_BYTES; the last one is kept anyway.
const JPEG_QUALITIES = [82, 72, 62]
// The page is fitted inside the card with this much room on each side, over a softened, darkened
// copy of itself, with a soft shadow below it so a white page stands out from a pale backdrop.
const PAGE_MARGIN = { x: 60, y: 36 }
const SHADOW = { spread: 24, offsetY: 8, blur: 10, opacity: 0.45 }
// The backdrop is blurred at a quarter of the size, which is much faster and looks the same.
const BACKDROP_SCALE = 4
const BACKDROP_BLUR = 8
const BACKDROP_BRIGHTNESS = 0.78
const MAX_INPUT_PIXELS = 40_000_000

// A generation claims the flipbook for LEASE_MS; a failed one may be tried again after
// RETRY_DELAY_MS, at most MAX_ATTEMPTS times in all, so a broken page never causes endless work.
export const MAX_SOCIAL_IMAGE_ATTEMPTS = 3
// Longer than the slowest possible generation (page fetch 30s + upload 120s, the timeouts in
// pdfStorage.js), so a slow run is never claimed a second time while it is still working.
export const SOCIAL_IMAGE_LEASE_MS = 5 * 60 * 1000
const RETRY_DELAY_MS = 10 * 60 * 1000
// Generations running at once in this process; more are skipped and happen on a later request.
const MAX_ACTIVE_GENERATIONS = 2

let activeGenerations = 0

// Builds the 1200x630 JPEG from a page image (any format sharp reads). Throws if it cannot be read.
export async function renderSocialImage(pageImage, { maxBytes = MAX_SOCIAL_IMAGE_BYTES } = {}) {
  const input = () => sharp(pageImage, { limitInputPixels: MAX_INPUT_PIXELS }).flatten({ background: '#ffffff' })

  const backdrop = await input()
    .resize(Math.round(SOCIAL_IMAGE_WIDTH / BACKDROP_SCALE), Math.round(SOCIAL_IMAGE_HEIGHT / BACKDROP_SCALE), { fit: 'cover' })
    .blur(BACKDROP_BLUR)
    .modulate({ brightness: BACKDROP_BRIGHTNESS })
    .png()
    .toBuffer()

  const pageBox = { width: SOCIAL_IMAGE_WIDTH - 2 * PAGE_MARGIN.x, height: SOCIAL_IMAGE_HEIGHT - 2 * PAGE_MARGIN.y }
  const { data: page, info } = await input().resize({ ...pageBox, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })

  // sharp composites after every other operation in a pipeline, so the blur needs its own step.
  const shadowShape = await sharp({
    create: { width: info.width + 2 * SHADOW.spread, height: info.height + 2 * SHADOW.spread, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: { create: { width: info.width, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: SHADOW.opacity } } },
        left: SHADOW.spread,
        top: SHADOW.spread,
      },
    ])
    .png()
    .toBuffer()
  const shadow = await sharp(shadowShape).blur(SHADOW.blur).png().toBuffer()

  const left = Math.round((SOCIAL_IMAGE_WIDTH - info.width) / 2)
  const top = Math.round((SOCIAL_IMAGE_HEIGHT - info.height) / 2)
  const card = await sharp(backdrop)
    .resize(SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT)
    .composite([
      { input: shadow, left: left - SHADOW.spread, top: top - SHADOW.spread + SHADOW.offsetY },
      { input: page, left, top },
    ])
    .png()
    .toBuffer()

  let data = null
  for (const quality of JPEG_QUALITIES) {
    data = await sharp(card).jpeg({ quality, mozjpeg: true }).toBuffer()
    if (data.length <= maxBytes) break
  }
  return { data, width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT }
}

// Whether a stored flipbook still needs an image and may be given one now. The claim in
// ensureSocialImage checks the same conditions atomically; this only saves a database write.
export function needsSocialImage(flipbook, now = new Date()) {
  const generation = flipbook.socialImageGeneration
  if (flipbook.socialImage?.publicId) return false
  if ((generation?.attempts ?? 0) >= MAX_SOCIAL_IMAGE_ATTEMPTS) return false
  return !(generation?.leaseExpiresAt && generation.leaseExpiresAt > now)
}

function claimFilter(flipbookId, now) {
  return {
    _id: flipbookId,
    status: 'ready',
    socialImage: null,
    'socialImageGeneration.attempts': { $not: { $gte: MAX_SOCIAL_IMAGE_ATTEMPTS } },
    'socialImageGeneration.leaseExpiresAt': { $not: { $gt: now } },
  }
}

async function removeUploaded(publicId, flipbookId) {
  try {
    await deleteSocialImage(publicId)
  } catch (error) {
    console.error(`Unused social preview image of flipbook ${flipbookId} could not be removed (${error.name}); it is removed with the flipbook`)
  }
}

async function generate(flipbookId) {
  const now = new Date()
  const flipbook = await Flipbook.findOneAndUpdate(
    claimFilter(flipbookId, now),
    {
      $set: { 'socialImageGeneration.leaseExpiresAt': new Date(now.getTime() + SOCIAL_IMAGE_LEASE_MS) },
      $inc: { 'socialImageGeneration.attempts': 1 },
    },
    { returnDocument: 'after', projection: { ownerId: 1, pages: { $elemMatch: { pageNumber: 1 } } } }
  )
  // Already made, being made, not converted, deleted, or out of attempts.
  if (!flipbook) return 'not_needed'

  try {
    const page = flipbook.pages?.[0]
    if (!page) throw new Error('First page missing')
    const image = await renderSocialImage(await fetchPageImage(page))
    const asset = await uploadSocialImage(image.data, `${socialFolder(flipbook.ownerId, flipbook._id)}/og-${randomUUID()}`)
    // Saved only if the flipbook is still ready and has no image, so a deletion that started
    // meanwhile or a concurrent generation wins; the new file is then removed again. If the save
    // itself fails, the file is kept rather than risk a record pointing at a deleted file; the
    // whole social folder goes with the flipbook.
    const result = await Flipbook.updateOne(
      { _id: flipbook._id, status: 'ready', socialImage: null },
      {
        $set: {
          socialImage: {
            publicId: asset.public_id,
            version: asset.version,
            format: asset.format,
            width: image.width,
            height: image.height,
            bytes: asset.bytes,
            createdAt: new Date(),
          },
          'socialImageGeneration.leaseExpiresAt': null,
        },
      }
    )
    if (result.matchedCount === 0) {
      await removeUploaded(asset.public_id, flipbook._id)
      return 'not_needed'
    }
    return 'created'
  } catch (error) {
    // Cloudinary and sharp error text can include internal details, so only the type is logged.
    console.error(`Social preview image failed for flipbook ${flipbook._id}: ${error.name} ${error.http_code ?? ''}`.trim())
    try {
      await Flipbook.updateOne({ _id: flipbook._id }, { $set: { 'socialImageGeneration.leaseExpiresAt': new Date(Date.now() + RETRY_DELAY_MS) } })
    } catch (saveError) {
      console.error(`Could not record the failed social preview image for flipbook ${flipbook._id}: ${saveError.name}`)
    }
    return 'failed'
  }
}

// Makes the flipbook's social preview image if it has none. Never throws and never needs to be
// awaited: the flipbook works without an image (link previews then show the title only).
// Returns 'created', 'not_needed', 'failed', 'busy' or 'not_configured'.
export async function ensureSocialImage(flipbookId) {
  if (!getCloudinary()) return 'not_configured'
  if (activeGenerations >= MAX_ACTIVE_GENERATIONS) return 'busy'
  activeGenerations++
  try {
    return await generate(flipbookId)
  } catch (error) {
    console.error(`Social preview image could not be started for flipbook ${flipbookId}: ${error.name}`)
    return 'failed'
  } finally {
    activeGenerations--
  }
}
