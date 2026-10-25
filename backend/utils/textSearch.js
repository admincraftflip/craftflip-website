import Flipbook from '../models/Flipbook.js'
import FlipbookText from '../models/FlipbookText.js'
import { getCloudinary } from '../config/cloudinary.js'
import { MAX_PDF_SIZE_BYTES, hasPdfSignature } from './pdfFile.js'
import { openPdf } from './pdfRenderer.js'
import { downloadPdf } from './pdfStorage.js'
import { MAX_TEXT_ATTEMPTS, foldPage, limitFlipbookText, parseQuery, searchPages, searchStatus } from './pageText.js'

// Text search (October 2026, unnumbered follow-up): storing the page text of a flipbook, reading
// it from the stored PDF for flipbooks converted before text search, and searching it. The
// conversion keeps the text of each page as it renders (utils/pdfConversion.js). See
// REFERENCE.md, "Text search".

// Reading the text of an older flipbook claims it for TEXT_LEASE_MS, longer than the slowest
// possible reading (the 2-minute download timeout in pdfStorage.js plus TEXT_READ_TIMEOUT_MS), so a
// slow run is never claimed a second time; a failed reading may be tried again after
// RETRY_DELAY_MS, at most MAX_TEXT_ATTEMPTS times.
export const TEXT_LEASE_MS = 12 * 60 * 1000
const TEXT_READ_TIMEOUT_MS = 8 * 60 * 1000
const RETRY_DELAY_MS = 10 * 60 * 1000
// One reading at a time in this process (it opens its own PDF worker); more are skipped and
// happen on a later request.
const MAX_ACTIVE_READINGS = 1

// Prepared page text of recently searched flipbooks, so typing a search does not load and fold
// the same text for every keystroke. Least recently used first; bounded by characters (each costs
// about 8 bytes prepared: the text, its folded copy and a position), so at most about 32 MB.
const CACHE_MAX_ENTRIES = 20
const CACHE_MAX_CHARACTERS = 4_000_000
const cache = new Map()
let cachedCharacters = 0
let activeReadings = 0

function cacheKey(flipbookId, attemptId) {
  return `${flipbookId}:${attemptId}`
}

function remember(key, entry) {
  cache.set(key, entry)
  cachedCharacters += entry.characters
  for (const [oldKey, oldEntry] of cache) {
    if (cache.size <= CACHE_MAX_ENTRIES && cachedCharacters <= CACHE_MAX_CHARACTERS) break
    if (oldKey === key) continue
    cache.delete(oldKey)
    cachedCharacters -= oldEntry.characters
  }
}

// Removes a flipbook's prepared text from the cache (it was deleted).
export function forgetFlipbookText(flipbookId) {
  for (const [key, entry] of cache) {
    if (key.startsWith(`${flipbookId}:`)) {
      cache.delete(key)
      cachedCharacters -= entry.characters
    }
  }
}

async function preparedPages(flipbookId, attemptId) {
  const key = cacheKey(flipbookId, attemptId)
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return cached.pages
  }
  const stored = await FlipbookText.findOne({ flipbookId, attemptId }).select('pages characters').lean()
  if (!stored) return null
  const pages = stored.pages.map((text) => foldPage(text ?? ''))
  remember(key, { pages, characters: stored.characters ?? 0 })
  return pages
}

// Stores a flipbook's page texts (index = page number - 1) for one conversion attempt, replacing
// any earlier text. Returns the textSearch status to record: "ready", or "empty" for a PDF
// without text (nothing is stored then).
export async function saveFlipbookText(flipbook, attemptId, texts) {
  const { pages, characters, hasText } = limitFlipbookText(texts)
  if (!hasText) {
    await FlipbookText.deleteOne({ flipbookId: flipbook._id })
    return 'empty'
  }
  await FlipbookText.updateOne(
    { flipbookId: flipbook._id },
    { $set: { ownerId: flipbook.ownerId, attemptId, pages, characters } },
    { upsert: true }
  )
  return 'ready'
}

// Removes stored text that turned out to be unused (its conversion was superseded, or the
// flipbook was deleted meanwhile). Failures are logged: the text is removed with the flipbook.
export async function removeFlipbookText(flipbookId, attemptId) {
  try {
    await FlipbookText.deleteOne({ flipbookId, attemptId })
  } catch (error) {
    console.error(`Unused search text of flipbook ${flipbookId} could not be removed (${error.name})`)
  }
}

// Whether a stored flipbook needs its text read and may be claimed now. The claim in
// ensureSearchText checks the same conditions atomically; this only saves a database write.
export function needsSearchText(flipbook, now = new Date()) {
  if (searchStatus(flipbook) !== 'preparing') return false
  return !(flipbook.textSearch?.leaseExpiresAt && flipbook.textSearch.leaseExpiresAt > now)
}

async function readAllText(pdf, pageCount) {
  const renderer = await openPdf(pdf)
  const deadline = setTimeout(() => renderer.close(), TEXT_READ_TIMEOUT_MS)
  try {
    const texts = []
    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, renderer.pageCount); pageNumber++) {
      texts.push(await renderer.readText(pageNumber))
    }
    return texts
  } finally {
    clearTimeout(deadline)
    await renderer.close()
  }
}

async function readText(flipbookId) {
  const now = new Date()
  const flipbook = await Flipbook.findOneAndUpdate(
    {
      _id: flipbookId,
      status: 'ready',
      'textSearch.status': null,
      'textSearch.attempts': { $not: { $gte: MAX_TEXT_ATTEMPTS } },
      'textSearch.leaseExpiresAt': { $not: { $gt: now } },
    },
    { $set: { 'textSearch.leaseExpiresAt': new Date(now.getTime() + TEXT_LEASE_MS) }, $inc: { 'textSearch.attempts': 1 } },
    { returnDocument: 'after', projection: { ownerId: 1, pageCount: 1, pdfAsset: 1, 'conversion.attemptId': 1 } }
  )
  // Already read, being read, not converted, deleted, or out of attempts.
  if (!flipbook) return 'not_needed'

  const attemptId = flipbook.conversion?.attemptId
  try {
    if (!attemptId || !flipbook.pageCount) throw new Error('Conversion details missing')
    const pdf = await downloadPdf(flipbook.pdfAsset.publicId)
    if (!hasPdfSignature(pdf) || pdf.length > MAX_PDF_SIZE_BYTES) throw new Error('Stored PDF unreadable')
    const status = await saveFlipbookText(flipbook, attemptId, await readAllText(pdf, flipbook.pageCount))
    // Recorded only while the flipbook is still the same Ready conversion; otherwise (deleted
    // meanwhile) the stored text is removed again.
    const result = await Flipbook.updateOne(
      { _id: flipbook._id, status: 'ready', 'conversion.attemptId': attemptId, 'textSearch.status': null },
      { $set: { 'textSearch.status': status, 'textSearch.attemptId': attemptId, 'textSearch.leaseExpiresAt': null } }
    )
    if (result.matchedCount === 0) {
      await removeFlipbookText(flipbook._id, attemptId)
      return 'not_needed'
    }
    return status
  } catch (error) {
    // pdf.js and Cloudinary error text can include internal details, so only the type is logged.
    console.error(`Search text failed for flipbook ${flipbook._id}: ${error.name} ${error.code ?? error.http_code ?? ''}`.trim())
    try {
      await Flipbook.updateOne({ _id: flipbook._id }, { $set: { 'textSearch.leaseExpiresAt': new Date(Date.now() + RETRY_DELAY_MS) } })
    } catch (saveError) {
      console.error(`Could not record the failed search text for flipbook ${flipbook._id}: ${saveError.name}`)
    }
    return 'failed'
  }
}

// Reads and stores the text of a Ready flipbook that has none yet (converted before text
// search). Never throws and never needs to be awaited: the reader works without search.
// Returns 'ready', 'empty', 'not_needed', 'failed', 'busy' or 'not_configured'.
export async function ensureSearchText(flipbookId) {
  if (!getCloudinary()) return 'not_configured'
  if (activeReadings >= MAX_ACTIVE_READINGS) return 'busy'
  activeReadings++
  try {
    return await readText(flipbookId)
  } catch (error) {
    console.error(`Search text could not be started for flipbook ${flipbookId}: ${error.name}`)
    return 'failed'
  } finally {
    activeReadings--
  }
}

// Searches a stored flipbook (selected with status, textSearch and conversion.attemptId) for what
// the reader typed. Returns { error } for a query that is too short or long; otherwise the search
// status and, when it is "ready", the results (utils/pageText.js, searchPages). A flipbook whose
// text is not read yet gets it read in the background.
export async function searchFlipbook(flipbook, value) {
  const query = parseQuery(value)
  if (!query) return { error: 'Type at least 2 characters to search.' }
  const status = searchStatus(flipbook)
  const empty = { status, results: [], total: 0, limited: false }
  if (status === 'preparing') {
    if (needsSearchText(flipbook)) ensureSearchText(flipbook._id)
    return empty
  }
  if (status !== 'ready') return empty
  const pages = await preparedPages(flipbook._id, flipbook.textSearch.attemptId)
  if (!pages) return { ...empty, status: 'unavailable' }
  return { status, ...searchPages(pages, query) }
}
