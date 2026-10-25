// Text search inside flipbooks (October 2026, unnumbered follow-up): the page text pdf.js finds in
// the PDF, and the search over it. Pure functions, used by the PDF worker, the conversion, the
// search for older flipbooks (utils/textSearch.js) and the search endpoints. See REFERENCE.md,
// "Text search".

// Per page and per flipbook, so one stored document stays far below MongoDB's 16 MB limit even for
// 200 text-dense pages (3 million characters is at most about 12 MB of UTF-8).
export const MAX_PAGE_TEXT_LENGTH = 20_000
export const MAX_FLIPBOOK_TEXT_LENGTH = 3_000_000

export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 100
// Results sent per search, and how far matches are counted beyond them.
export const MAX_RESULTS = 200
export const MAX_COUNTED_MATCHES = 1000
// Characters of context around a match in a snippet.
const SNIPPET_BEFORE = 50
const SNIPPET_AFTER = 70

// Control characters become spaces, runs of spaces one, and the result is trimmed.
function tidy(text) {
  let result = ''
  for (const character of text) {
    const code = character.codePointAt(0)
    result += code < 32 || (code >= 127 && code < 160) ? ' ' : character
  }
  return result.replace(/\s+/g, ' ').trim()
}

// One page's text from pdf.js getTextContent() items: the strings in reading order, with a space
// where pdf.js marks the end of a line. Tidied and cut to MAX_PAGE_TEXT_LENGTH.
export function textFromItems(items) {
  const parts = []
  for (const item of items ?? []) {
    if (typeof item?.str !== 'string') continue
    parts.push(item.str)
    if (item.hasEOL) parts.push(' ')
  }
  return tidy(parts.join('')).slice(0, MAX_PAGE_TEXT_LENGTH)
}

// The page texts of a flipbook, in page order, within MAX_FLIPBOOK_TEXT_LENGTH (pages past the
// budget keep only what fits). hasText: whether any page has text at all (a scanned PDF has none).
export function limitFlipbookText(texts) {
  let remaining = MAX_FLIPBOOK_TEXT_LENGTH
  const pages = texts.map((text) => {
    const kept = typeof text === 'string' ? text.slice(0, Math.max(0, remaining)) : ''
    remaining -= kept.length
    return kept
  })
  return { pages, characters: MAX_FLIPBOOK_TEXT_LENGTH - remaining, hasText: pages.some((text) => text.length > 0) }
}

// Lowercase, without accents, compatibility forms unfolded ("ﬁ" is "fi", "Café" is "cafe"), so
// a search matches however the PDF or the reader wrote a word.
function foldCharacter(character) {
  return character.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

// A page prepared for searching: the folded text, and for each of its characters the position in
// the original text, so a match can be shown in the original spelling.
export function foldPage(text) {
  let folded = ''
  const positions = []
  let index = 0
  for (const character of text) {
    const replacement = foldCharacter(character)
    for (let count = 0; count < replacement.length; count++) positions.push(index)
    folded += replacement
    index += character.length
  }
  positions.push(index)
  return { text, folded, positions: Int32Array.from(positions) }
}

// The search text a reader typed, folded like the pages, or null when it is too short or too long.
export function parseQuery(value) {
  if (typeof value !== 'string') return null
  const query = tidy(value)
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return null
  const folded = Array.from(query, foldCharacter).join('')
  return folded.length >= MIN_QUERY_LENGTH ? folded : null
}

// Cuts context at a space when there is one near the edge, so snippets do not start mid-word.
function contextBefore(text, start) {
  if (start <= SNIPPET_BEFORE) return text.slice(0, start)
  let from = start - SNIPPET_BEFORE
  const space = text.indexOf(' ', from)
  if (space !== -1 && space < start - 10) from = space + 1
  return `…${text.slice(from, start)}`
}

function contextAfter(text, end) {
  if (text.length - end <= SNIPPET_AFTER) return text.slice(end)
  let to = end + SNIPPET_AFTER
  const space = text.lastIndexOf(' ', to)
  if (space > end + 10) to = space
  return `${text.slice(end, to)}…`
}

// Every match of a folded query in prepared pages (foldPage, index = page number - 1), in page
// order. Results carry the page and a snippet split around the match ({ before, match, after },
// plain text). total counts matches up to MAX_COUNTED_MATCHES; limited says it stopped there.
export function searchPages(preparedPages, query) {
  const results = []
  let total = 0
  for (let pageIndex = 0; pageIndex < preparedPages.length; pageIndex++) {
    const page = preparedPages[pageIndex]
    if (!page?.folded) continue
    let from = 0
    for (;;) {
      const found = page.folded.indexOf(query, from)
      if (found === -1) break
      total++
      if (results.length < MAX_RESULTS) {
        const start = page.positions[found]
        const end = page.positions[found + query.length]
        results.push({
          page: pageIndex + 1,
          before: contextBefore(page.text, start),
          match: page.text.slice(start, end),
          after: contextAfter(page.text, end),
        })
      }
      if (total >= MAX_COUNTED_MATCHES) return { results, total, limited: true }
      from = found + query.length
    }
  }
  return { results, total, limited: false }
}

// ---------- Status ----------

// Reading the text of a flipbook converted before text search is tried at most this many times.
export const MAX_TEXT_ATTEMPTS = 3

// What the reader is told about search for a stored flipbook: "ready", "preparing" (text not read
// yet; it is being read or will be on the next request), "unavailable" (the PDF has no text, as
// in a scanned document, or reading it failed every time), or null before the flipbook is Ready.
export function searchStatus(flipbook) {
  if (flipbook?.status !== 'ready') return null
  const textSearch = flipbook.textSearch
  if (textSearch?.status === 'ready') return 'ready'
  if (textSearch?.status === 'empty') return 'unavailable'
  return (textSearch?.attempts ?? 0) >= MAX_TEXT_ATTEMPTS ? 'unavailable' : 'preparing'
}
