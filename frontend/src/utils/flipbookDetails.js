import { getApiErrorMessage } from './apiErrors.js'

// Matches the backend (backend/utils/slug.js); the server validates again.
export const MAX_TITLE_LENGTH = 120
const MIN_SLUG_LENGTH = 3
const MAX_SLUG_LENGTH = 80
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Tidies what the owner types into a link: lowercase, spaces and other characters become single
// hyphens. Leading and trailing hyphens are kept while typing and removed by finishSlug.
export function slugFromInput(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').slice(0, MAX_SLUG_LENGTH)
}

export function finishSlug(text) {
  return slugFromInput(text).replace(/^-+|-+$/g, '')
}

export function isValidSlug(slug) {
  return slug.length >= MIN_SLUG_LENGTH && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug)
}

// Only the fields that actually changed, so an unchanged link never asks for confirmation.
export function detailsChanges(flipbook, form) {
  const changes = {}
  const title = form.title.replace(/\s+/g, ' ').trim()
  if (title !== flipbook.title) changes.title = title
  const slug = finishSlug(form.slug)
  if (slug !== flipbook.slug) changes.slug = slug
  return changes
}

// A client-side check for clear messages before sending; the server has the final word.
export function detailsProblem(changes) {
  if ('title' in changes && (changes.title.length < 1 || changes.title.length > MAX_TITLE_LENGTH)) {
    return `Titles must be 1 to ${MAX_TITLE_LENGTH} characters.`
  }
  if ('slug' in changes && !isValidSlug(changes.slug)) {
    return 'Links use 3 to 80 lowercase letters, numbers and single hyphens.'
  }
  return null
}

// A 404 on any owner action means the flipbook no longer exists (or is not this user's).
export function isMissing(error) {
  return error?.response?.status === 404
}

export async function saveFlipbookDetails(client, flipbookId, changes, { confirmSlugChange = false } = {}) {
  try {
    const body = 'slug' in changes && confirmSlugChange ? { ...changes, confirmSlugChange: true } : changes
    const response = await client.patch(`/api/flipbooks/${flipbookId}`, body)
    return { ok: true, flipbook: response.data.data.flipbook }
  } catch (error) {
    return {
      ok: false,
      missing: isMissing(error),
      requiresConfirmation: error.response?.data?.requiresConfirmation === true,
      message: getApiErrorMessage(error),
    }
  }
}
