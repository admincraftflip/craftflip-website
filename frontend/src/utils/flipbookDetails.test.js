import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailsChanges, detailsProblem, finishSlug, isMissing, isValidSlug, saveFlipbookDetails, slugFromInput } from './flipbookDetails.js'

const FLIPBOOK = { id: 'a', title: 'Spring Catalog', slug: 'spring-catalog-ab12' }

test('typed links are tidied into the allowed form', () => {
  assert.equal(slugFromInput('Spring Catalog 2026'), 'spring-catalog-2026')
  assert.equal(slugFromInput('Prix & Co.'), 'prix-co-')
  assert.equal(finishSlug('  -Prix & Co.- '), 'prix-co')
  assert.equal(finishSlug('Ünïcode Ñame'), 'n-code-ame')
  assert.ok(isValidSlug('spring-2026'))
  assert.ok(!isValidSlug('ab'))
  assert.ok(!isValidSlug('a--b'))
})

test('only changed fields are sent; an unchanged link is left out', () => {
  assert.deepEqual(detailsChanges(FLIPBOOK, { title: 'Spring Catalog', slug: 'spring-catalog-ab12' }), {})
  assert.deepEqual(detailsChanges(FLIPBOOK, { title: '  Spring   Catalog 2026 ', slug: 'spring-catalog-ab12' }), { title: 'Spring Catalog 2026' })
  assert.deepEqual(detailsChanges(FLIPBOOK, { title: 'Spring Catalog', slug: 'Spring Catalog 2026' }), { slug: 'spring-catalog-2026' })
})

test('obvious problems are caught before sending', () => {
  assert.match(detailsProblem({ title: '' }), /1 to 120/)
  assert.match(detailsProblem({ title: 'x'.repeat(121) }), /1 to 120/)
  assert.match(detailsProblem({ slug: 'ab' }), /3 to 80/)
  assert.equal(detailsProblem({ title: 'Fine', slug: 'fine-link' }), null)
})

function client(handler) {
  const calls = []
  return {
    calls,
    async patch(url, body) {
      calls.push([url, body])
      return handler(body)
    },
  }
}

function apiError(status, data) {
  return Object.assign(new Error('Request failed'), { response: { status, data } })
}

test('saving sends the changes, adding the confirmation only for a link change', async () => {
  const ok = client((body) => ({ data: { data: { flipbook: { ...FLIPBOOK, ...body } } } }))
  const titleOnly = await saveFlipbookDetails(ok, 'a', { title: 'New' }, { confirmSlugChange: true })
  assert.equal(titleOnly.ok, true)
  assert.deepEqual(ok.calls[0], ['/api/flipbooks/a', { title: 'New' }])

  await saveFlipbookDetails(ok, 'a', { slug: 'new-link' }, { confirmSlugChange: true })
  assert.deepEqual(ok.calls[1], ['/api/flipbooks/a', { slug: 'new-link', confirmSlugChange: true }])
})

test('a link change that needs confirmation, a missing flipbook and a network failure are told apart', async () => {
  const confirm = client(() => {
    throw apiError(409, { success: false, message: 'Confirm to continue.', requiresConfirmation: true })
  })
  assert.deepEqual(await saveFlipbookDetails(confirm, 'a', { slug: 'new-link' }), {
    ok: false,
    missing: false,
    requiresConfirmation: true,
    message: 'Confirm to continue.',
  })

  const gone = client(() => {
    throw apiError(404, { success: false, message: 'Flipbook not found.' })
  })
  const goneResult = await saveFlipbookDetails(gone, 'a', { title: 'New' })
  assert.equal(goneResult.missing, true)
  assert.equal(goneResult.message, 'Flipbook not found.')

  const offline = client(() => {
    throw new Error('Network Error')
  })
  assert.deepEqual(await saveFlipbookDetails(offline, 'a', { title: 'New' }), {
    ok: false,
    missing: false,
    requiresConfirmation: false,
    message: 'Something went wrong. Please try again.',
  })
  assert.equal(isMissing(apiError(404, {})), true)
  assert.equal(isMissing(new Error('x')), false)
})
