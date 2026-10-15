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

// "Boutique Home Group Florida" -> "boutique-home-group-florida-x7k2"
export function generateSlug(title) {
  return `${slugifyTitle(title)}-${randomSuffix()}`
}
