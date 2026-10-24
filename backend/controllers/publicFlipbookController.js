import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import Flipbook from '../models/Flipbook.js'
import { getCloudinary } from '../config/cloudinary.js'
import { openOriginalPdfStream, openPageImageStream } from '../utils/pdfStorage.js'
import { publicReaderView } from '../utils/readerSettings.js'
import { pageImageContentType, pageImageVariant } from '../utils/pageImageVariant.js'
import { resolveViewerStyle } from '../utils/viewerStyles.js'
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '../utils/slug.js'
import ViewSession from '../models/ViewSession.js'
import { deviceTypeFrom, isLikelyBot, parseActivity, sessionUpsert } from '../utils/analytics.js'
import { ensureSocialImage, needsSocialImage } from '../utils/socialImage.js'

// Slugs are lowercase words and digits joined by hyphens (utils/slug.js).
// Browsers may keep a page image for five minutes; "private" forbids shared caches and CDNs.
export const PAGE_IMAGE_CACHE_CONTROL = 'private, max-age=300'
const NOT_FOUND = { success: false, message: 'Flipbook not found.' }

function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug)
}

// The only filter under which a flipbook is public. Deleting clears isPublished, and the status
// check also hides a flipbook whose deletion has started.
function publishedFilter(slug) {
  return { slug, isPublished: true, status: 'ready' }
}

// Every public response, including errors, is uncacheable and kept out of search engines unless
// a handler says otherwise.
export function publicResponseHeaders(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' })
  next()
}

// What the public viewer needs, and nothing else: built field by field, never from the document.
export async function getPublicFlipbook(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)

  const flipbook = await Flipbook.findOne(publishedFilter(slug)).select(
    'slug title viewerStyle reader pageCount pages.pageNumber pages.width pages.height socialImage socialImageGeneration'
  )
  if (!flipbook) return res.status(404).json(NOT_FOUND)
  // A published flipbook without a social preview image (converted before Milestone 13, or an
  // earlier attempt failed) gets one in the background; this response goes out without it.
  if (needsSocialImage(flipbook)) ensureSocialImage(flipbook._id)

  const pages = flipbook.pages
    .map(({ pageNumber, width, height }) => ({ pageNumber, width, height }))
    .sort((first, second) => first.pageNumber - second.pageNumber)
  const publicFlipbook = {
    slug: flipbook.slug,
    title: flipbook.title,
    viewerStyle: resolveViewerStyle(flipbook.viewerStyle),
    reader: publicReaderView(flipbook.reader),
    pageCount: pages.length,
    pages,
    socialImage: publicSocialImageView(flipbook.socialImage),
  }
  res.json({ success: true, data: { flipbook: publicFlipbook } })
}

// Link previews (Milestone 13) need only the size and a revision for the image address.
function publicSocialImageView(socialImage) {
  if (!socialImage?.publicId) return null
  return { width: socialImage.width, height: socialImage.height, revision: new Date(socialImage.createdAt).getTime() }
}

// The social preview image (Milestone 13) of a published flipbook, for link preview crawlers.
// Checked on every request like pages; the stored image stays private in Cloudinary.
export async function getPublicSocialImage(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)
  if (!getCloudinary()) return res.status(503).json({ success: false, message: 'Images are temporarily unavailable. Please try again later.' })
  const flipbook = await Flipbook.findOne(publishedFilter(slug)).select('socialImage')
  const image = flipbook?.socialImage
  if (!image?.publicId) return res.status(404).json(NOT_FOUND)
  let opened
  try {
    opened = await openPageImageStream(image)
  } catch (error) {
    console.error(`Public social image failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't load the preview image. Please try again." })
  }
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': PAGE_IMAGE_CACHE_CONTROL })
  await pipeTo(res, opened)
}

// Streams one page of a published flipbook. Publication is checked on every request, so the
// first request after unpublishing or deleting is refused.
export async function getPublicPageImage(req, res) {
  const { slug } = req.params
  const pageNumber = Number(req.params.pageNumber)
  // ?size=thumb: the small preview for the thumbnail panel, under the same publication checks.
  const variant = pageImageVariant(req.query)
  if (!isValidSlug(slug) || !Number.isInteger(pageNumber) || pageNumber < 1 || !variant) {
    return res.status(404).json({ success: false, message: 'Page not found.' })
  }
  if (!getCloudinary()) {
    return res.status(503).json({ success: false, message: 'Page images are temporarily unavailable. Please try again later.' })
  }

  const flipbook = await Flipbook.findOne(publishedFilter(slug)).select({ pageCount: 1, pages: { $elemMatch: { pageNumber } } })
  const page = flipbook?.pages?.[0]
  if (!page || pageNumber > flipbook.pageCount) {
    return res.status(404).json({ success: false, message: 'Page not found.' })
  }

  let image
  try {
    image = await openPageImageStream(page, variant)
  } catch (error) {
    // The message carries only the HTTP status, never the signed URL.
    console.error(`Public page image failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't load this page. Please try again." })
  }

  res.set({ 'Content-Type': pageImageContentType(variant, page.format), 'Cache-Control': PAGE_IMAGE_CACHE_CONTROL })
  if (image.contentLength) res.set('Content-Length', String(image.contentLength))
  try {
    await pipeline(Readable.fromWeb(image.stream), res)
  } catch (error) {
    // The visitor closed the page or Cloudinary dropped the connection mid-image.
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(`Public page image stream failed: ${error.name}`)
  }
}

async function pipeTo(res, opened) {
  if (opened.contentLength) res.set('Content-Length', String(opened.contentLength))
  try {
    await pipeline(Readable.fromWeb(opened.stream), res)
  } catch (error) {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(`Public stream failed: ${error.name}`)
  }
}

// The reader's logo for a published flipbook (Milestone 9), checked on every request like pages.
export async function getPublicLogo(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)
  if (!getCloudinary()) return res.status(503).json({ success: false, message: 'Images are temporarily unavailable. Please try again later.' })
  const flipbook = await Flipbook.findOne(publishedFilter(slug)).select('reader.logo')
  const logo = flipbook?.reader?.logo
  if (!logo?.publicId) return res.status(404).json(NOT_FOUND)
  let opened
  try {
    opened = await openPageImageStream(logo)
  } catch (error) {
    console.error(`Public logo failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't load the logo. Please try again." })
  }
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': PAGE_IMAGE_CACHE_CONTROL })
  await pipeTo(res, opened)
}

// The reader's uploaded background for a published flipbook, only while it is the chosen
// background (a stored image that is not in use is never served). Checked on every request.
export async function getPublicBackground(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)
  if (!getCloudinary()) return res.status(503).json({ success: false, message: 'Images are temporarily unavailable. Please try again later.' })
  const flipbook = await Flipbook.findOne({ ...publishedFilter(slug), 'reader.background.kind': 'image' }).select('reader.background.image')
  const image = flipbook?.reader?.background?.image
  if (!image?.publicId) return res.status(404).json(NOT_FOUND)
  let opened
  try {
    opened = await openPageImageStream(image)
  } catch (error) {
    console.error(`Public background failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't load the background. Please try again." })
  }
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': PAGE_IMAGE_CACHE_CONTROL })
  await pipeTo(res, opened)
}

// Downloading the original PDF (Milestone 9): only for a published, Ready flipbook whose owner
// allows downloads, checked in the query on every request. The file streams through the server;
// no Cloudinary address reaches the visitor. Missing, unpublished and download-disabled flipbooks
// all get the same 404.
export async function downloadPublicPdf(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)
  if (!getCloudinary()) return res.status(503).json({ success: false, message: 'Downloads are temporarily unavailable. Please try again later.' })
  const flipbook = await Flipbook.findOne({ ...publishedFilter(slug), 'reader.allowDownload': true }).select('slug pdfAsset')
  if (!flipbook) return res.status(404).json(NOT_FOUND)
  let opened
  try {
    opened = await openOriginalPdfStream(flipbook.pdfAsset.publicId)
  } catch (error) {
    console.error(`Public download failed: ${error.message}`)
    return res.status(502).json({ success: false, message: "We couldn't prepare the download. Please try again." })
  }
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${flipbook.slug}.pdf"` })
  await pipeTo(res, opened)
}

// Activity from the public viewer (Milestone 10): opening a published flipbook and the pages shown.
// The viewer sends it as a small text/plain JSON body, so browsers send it without a CORS preflight
// and can send the last report while the page closes. Only published, Ready flipbooks are counted;
// anything else gets the usual 404 and nothing is stored. The answer is always empty: no visitor
// or analytics data is returned. Bots and invalid reports are ignored without an error the viewer
// would need to handle.
export async function recordActivity(req, res) {
  const { slug } = req.params
  if (!isValidSlug(slug)) return res.status(404).json(NOT_FOUND)

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid activity report.' })
    }
  }

  const flipbook = await Flipbook.findOne(publishedFilter(slug)).select('_id ownerId pageCount')
  if (!flipbook) return res.status(404).json(NOT_FOUND)

  const activity = parseActivity(body, flipbook.pageCount ?? 0)
  if (activity.error) return res.status(400).json({ success: false, message: activity.error })

  const userAgent = req.get('user-agent')
  if (isLikelyBot(userAgent)) return res.status(204).end()

  const { filter, update, options } = sessionUpsert({ flipbook, activity, deviceType: deviceTypeFrom(userAgent), now: new Date() })
  try {
    await ViewSession.findOneAndUpdate(filter, update, options)
  } catch (error) {
    // Reading never depends on analytics; the failure is only logged.
    console.error(`Analytics write failed: ${error.name}`)
  }
  res.status(204).end()
}
