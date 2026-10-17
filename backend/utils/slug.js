import { randomInt } from 'node:crypto'

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LENGTH = 4
const MAX_BASE_LENGTH = 60
const FALLBACK_BASE = 'flipbook'

function slugifyTitle(title) {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/, '')
  return base || FALLBACK_BASE
}

function randomSuffix() {
  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)]
  }
  return suffix
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MIN_SLUG_LENGTH = 3
export const MAX_SLUG_LENGTH = 80

// An owner-chosen slug: trimmed and lowercased, then it must be words of a-z and 0-9 joined by
// single hyphens, 3-80 characters. Returns null if it is not acceptable.
export function normalizeSlugInput(value) {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) return null
  return slug
}

// "Boutique Home Group Florida" -> "boutique-home-group-florida-x7k2"
export function generateSlug(title) {
  return `${slugifyTitle(title)}-${randomSuffix()}`
}
