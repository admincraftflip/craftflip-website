import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeCollection } from './helpers/fakeCollection.js'

const moduleUrl = (path) => new URL(path, import.meta.url).href

let flipbooks
let slugRegistry
let users
const models = {
  Flipbook: new Proxy({}, { get: (target, name) => flipbooks[name] }),
  PublishedSlug: new Proxy({}, { get: (target, name) => slugRegistry[name] }),
  User: new Proxy({}, { get: (target, name) => users[name] }),
}

mock.module(moduleUrl('../models/Flipbook.js'), { defaultExport: models.Flipbook })
mock.module(moduleUrl('../models/PublishedSlug.js'), { defaultExport: models.PublishedSlug })
mock.module(moduleUrl('../models/User.js'), { defaultExport: models.User })

const { publishFlipbook, unpublishFlipbook, isSlugRetired, PublishError } = await import('../utils/publishing.js')

let nextId = 1
const newId = () => `id${String(nextId++).padStart(22, '0')}`

function addUser(plan = 'free') {
  const user = { _id: newId(), plan, publishLock: { token: null, expiresAt: null } }
  users.insert(user)
  return user
}

function addFlipbook(owner, fields = {}) {
  const flipbook = {
    _id: newId(),
    ownerId: owner._id,
    title: 'Listing Presentation',
    slug: `listing-presentation-${newId().slice(-4)}`,
    status: 'ready',
    isPublished: false,
    publishedAt: null,
    firstPublishedAt: null,
    unpublishedAt: null,
    ...fields,
  }
  flipbooks.insert(flipbook)
  return flipbook
}

const stored = (flipbook) => flipbooks.documents.find((document) => document._id === flipbook._id)
const reservationsFor = (flipbook) => slugRegistry.documents.filter((document) => document.flipbookId === flipbook._id)

async function expectPublishError(promise, status, messagePattern) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PublishError, `expected PublishError, got ${error}`)
    assert.equal(error.status, status)
    if (messagePattern) assert.match(error.message, messagePattern)
    return true
  })
}

beforeEach(() => {
  flipbooks = createFakeCollection()
  slugRegistry = createFakeCollection({ uniqueFields: ['slug'] })
  users = createFakeCollection()
})

test('the owner publishes a Ready flipbook: published, slug reserved, lock released', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner)

  const result = await publishFlipbook(owner, flipbook._id)
  assert.equal(result.isPublished, true)
  assert.ok(stored(flipbook).publishedAt instanceof Date)
  assert.ok(stored(flipbook).firstPublishedAt instanceof Date)
  assert.deepEqual(reservationsFor(flipbook).map((reservation) => reservation.slug), [flipbook.slug])
  assert.equal(users.documents[0].publishLock.token, null)
})

test("another user's flipbook is not found and stays unpublished", async () => {
  const owner = addUser()
  const intruder = addUser()
  const flipbook = addFlipbook(owner)

  await expectPublishError(publishFlipbook(intruder, flipbook._id), 404)
  await expectPublishError(unpublishFlipbook(intruder, flipbook._id), 404)
  assert.equal(stored(flipbook).isPublished, false)
  assert.equal(slugRegistry.documents.length, 0)

  await publishFlipbook(owner, flipbook._id)
  await unpublishFlipbook(intruder, flipbook._id).catch(() => {})
  assert.equal(stored(flipbook).isPublished, true)
})

test('only Ready flipbooks can be published; nothing is reserved otherwise', async () => {
  const owner = addUser()
  for (const status of ['uploaded', 'processing', 'failed']) {
    await expectPublishError(publishFlipbook(owner, addFlipbook(owner, { status })._id), 409, /Only converted/)
  }
  await expectPublishError(publishFlipbook(owner, addFlipbook(owner, { status: 'deleting' })._id), 409, /being deleted/)
  await expectPublishError(publishFlipbook(owner, newId()), 404)
  assert.equal(flipbooks.documents.filter((document) => document.isPublished).length, 0)
  assert.equal(slugRegistry.documents.length, 0)
})

test('publishing and unpublishing are idempotent', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner)

  await publishFlipbook(owner, flipbook._id)
  const firstPublishedAt = stored(flipbook).publishedAt
  await publishFlipbook(owner, flipbook._id)
  assert.equal(stored(flipbook).publishedAt.getTime(), firstPublishedAt.getTime())
  assert.equal(reservationsFor(flipbook).length, 1)

  await unpublishFlipbook(owner, flipbook._id)
  const unpublishedAt = stored(flipbook).unpublishedAt
  const again = await unpublishFlipbook(owner, flipbook._id)
  assert.equal(again.isPublished, false)
  assert.equal(stored(flipbook).unpublishedAt.getTime(), unpublishedAt.getTime())
})

test('the slug stays the same across unpublish and republish, and the reservation is kept', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner)

  await publishFlipbook(owner, flipbook._id)
  const firstPublishedAt = stored(flipbook).firstPublishedAt
  await unpublishFlipbook(owner, flipbook._id)
  assert.equal(await isSlugRetired(flipbook.slug), true)
  await publishFlipbook(owner, flipbook._id)

  assert.equal(stored(flipbook).slug, flipbook.slug)
  assert.equal(stored(flipbook).firstPublishedAt.getTime(), firstPublishedAt.getTime())
  assert.equal(reservationsFor(flipbook).length, 1)
})

test('a slug published by a deleted flipbook is never reused: a new flipbook gets a fresh slug', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'listing-presentation-ab12' })
  // An earlier flipbook published this slug and was then deleted; only its reservation remains.
  slugRegistry.insert({ slug: 'listing-presentation-ab12', flipbookId: newId() })

  await publishFlipbook(owner, flipbook._id)

  const newSlug = stored(flipbook).slug
  assert.notEqual(newSlug, 'listing-presentation-ab12')
  assert.match(newSlug, /^listing-presentation-[a-z0-9]{4}$/)
  assert.deepEqual(reservationsFor(flipbook).map((reservation) => reservation.slug), [newSlug])
  assert.equal(slugRegistry.documents.filter((document) => document.slug === 'listing-presentation-ab12').length, 1)
})

test('deleting a published flipbook keeps its slug retired', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner)
  await publishFlipbook(owner, flipbook._id)

  // What the deletion endpoint does: claim (which unpublishes), then remove the record.
  await flipbooks.findOneAndUpdate({ _id: flipbook._id }, { $set: { status: 'deleting', isPublished: false } })
  await flipbooks.deleteOne({ _id: flipbook._id })

  assert.equal(await isSlugRetired(flipbook.slug), true)
})

test('two flipbooks with the same slug published at the same time never share a reservation', async () => {
  const first = addUser()
  const second = addUser()
  const firstFlipbook = addFlipbook(first, { slug: 'same-title-zz99' })
  const secondFlipbook = addFlipbook(second, { slug: 'same-title-zz99' })

  await Promise.all([publishFlipbook(first, firstFlipbook._id), publishFlipbook(second, secondFlipbook._id)])

  const slugs = [stored(firstFlipbook).slug, stored(secondFlipbook).slug]
  assert.notEqual(slugs[0], slugs[1])
  assert.ok(slugs.includes('same-title-zz99'))
  for (const flipbook of [firstFlipbook, secondFlipbook]) {
    assert.equal(stored(flipbook).isPublished, true)
    assert.deepEqual(reservationsFor(flipbook).map((reservation) => reservation.slug), [stored(flipbook).slug])
  }
})

test('the Free plan allows 3 published flipbooks; the 4th gets a clear 403 and nothing is reserved', async () => {
  const owner = addUser('free')
  const books = [1, 2, 3, 4].map(() => addFlipbook(owner))
  for (const flipbook of books.slice(0, 3)) await publishFlipbook(owner, flipbook._id)

  await expectPublishError(publishFlipbook(owner, books[3]._id), 403, /Free plan allows 3 published flipbooks/)
  assert.equal(stored(books[3]).isPublished, false)
  assert.equal(reservationsFor(books[3]).length, 0)
})

test('unpublishing or deleting frees a slot; republishing needs one', async () => {
  const owner = addUser('free')
  const books = [1, 2, 3, 4].map(() => addFlipbook(owner))
  for (const flipbook of books.slice(0, 3)) await publishFlipbook(owner, flipbook._id)

  await unpublishFlipbook(owner, books[0]._id)
  await publishFlipbook(owner, books[3]._id)
  await expectPublishError(publishFlipbook(owner, books[0]._id), 403)

  // A deletion claim unpublishes, which frees the slot even before the record is removed.
  await flipbooks.findOneAndUpdate({ _id: books[1]._id }, { $set: { status: 'deleting', isPublished: false } })
  await publishFlipbook(owner, books[0]._id)
  assert.equal(flipbooks.documents.filter((document) => document.isPublished && document.status === 'ready').length, 3)
})

test('simultaneous publishes cannot exceed the Free plan limit', async () => {
  const owner = addUser('free')
  const books = [1, 2, 3, 4, 5, 6].map(() => addFlipbook(owner))

  const results = await Promise.allSettled(books.map((flipbook) => publishFlipbook(owner, flipbook._id)))

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3)
  for (const result of results.filter((outcome) => outcome.status === 'rejected')) {
    assert.equal(result.reason.status, 403)
  }
  assert.equal(flipbooks.documents.filter((document) => document.isPublished).length, 3)
  assert.equal(slugRegistry.documents.length, 3)
})

test('simultaneous publishes of the same flipbook publish it once', async () => {
  const owner = addUser('free')
  const flipbook = addFlipbook(owner)

  const results = await Promise.all([1, 2, 3, 4, 5].map(() => publishFlipbook(owner, flipbook._id)))
  assert.ok(results.every((result) => result.isPublished))
  assert.equal(reservationsFor(flipbook).length, 1)
})

test('paid plans follow the pricing table: starter 10, pro unlimited', async () => {
  const starter = addUser('starter')
  const starterBooks = Array.from({ length: 11 }, () => addFlipbook(starter))
  for (const flipbook of starterBooks.slice(0, 10)) await publishFlipbook(starter, flipbook._id)
  await expectPublishError(publishFlipbook(starter, starterBooks[10]._id), 403, /Starter plan allows 10/)

  const pro = addUser('pro')
  for (const flipbook of Array.from({ length: 12 }, () => addFlipbook(pro))) await publishFlipbook(pro, flipbook._id)
  assert.equal(flipbooks.documents.filter((document) => document.ownerId === pro._id && document.isPublished).length, 12)
})

test('a deletion racing a publish never leaves a deleting flipbook published', async () => {
  for (let delayTicks = 0; delayTicks <= 12; delayTicks++) {
    const owner = addUser()
    const flipbook = addFlipbook(owner)

    const claimDeletion = async () => {
      for (let tick = 0; tick < delayTicks; tick++) await new Promise((resolve) => setImmediate(resolve))
      return flipbooks.findOneAndUpdate(
        { _id: flipbook._id, ownerId: owner._id, status: { $in: ['uploaded', 'ready', 'failed', 'deleting'] } },
        { $set: { status: 'deleting', isPublished: false } }
      )
    }
    const [publishResult] = await Promise.allSettled([publishFlipbook(owner, flipbook._id), claimDeletion()])

    assert.equal(stored(flipbook).status, 'deleting', `delay ${delayTicks}`)
    assert.equal(stored(flipbook).isPublished, false, `delay ${delayTicks}`)
    if (publishResult.status === 'rejected') {
      assert.equal(publishResult.reason.status, 409)
      // The slug never went public, so its reservation was released again.
      if (!stored(flipbook).firstPublishedAt) assert.equal(reservationsFor(flipbook).length, 0, `delay ${delayTicks}`)
    }
  }
})

test("a publish lock held by another request makes the publish wait, then report busy; an expired lease is taken over", async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner)

  users.documents[0].publishLock = { token: 'other-request', expiresAt: new Date(Date.now() + 60_000) }
  await expectPublishError(publishFlipbook(owner, flipbook._id), 409, /Another publish request/)
  assert.equal(stored(flipbook).isPublished, false)

  users.documents[0].publishLock = { token: 'crashed-request', expiresAt: new Date(Date.now() - 1000) }
  await publishFlipbook(owner, flipbook._id)
  assert.equal(stored(flipbook).isPublished, true)
})

const { changeSlug } = await import('../utils/publishing.js')

test('before the first publish the link changes freely; nothing is reserved for an unpublished flipbook', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'old-link-ab12' })
  const result = await changeSlug(owner, flipbook._id, 'new-link')
  assert.equal(result.slug, 'new-link')
  assert.equal(stored(flipbook).slug, 'new-link')
  assert.equal(slugRegistry.documents.length, 0)
})

test('after a publish the link changes only when confirmed; the old link stays retired and the new one is reserved', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'old-link-ab12' })
  await publishFlipbook(owner, flipbook._id)

  await expectPublishError(changeSlug(owner, flipbook._id, 'new-link'), 409, /Confirm to continue/)
  await assert.rejects(changeSlug(owner, flipbook._id, 'new-link'), (error) => error.details.requiresConfirmation === true)
  assert.equal(stored(flipbook).slug, 'old-link-ab12')

  await changeSlug(owner, flipbook._id, 'new-link', { confirmed: true })
  assert.equal(stored(flipbook).slug, 'new-link')
  assert.equal(stored(flipbook).isPublished, true)
  assert.equal(await isSlugRetired('old-link-ab12'), true)
  assert.deepEqual(reservationsFor(flipbook).map((reservation) => reservation.slug).sort(), ['new-link', 'old-link-ab12'])
})

test('a previously published but now unpublished flipbook still needs confirmation; its new link is reserved at the next publish', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'old-link-ab12' })
  await publishFlipbook(owner, flipbook._id)
  await unpublishFlipbook(owner, flipbook._id)

  await expectPublishError(changeSlug(owner, flipbook._id, 'later-link'), 409)
  await changeSlug(owner, flipbook._id, 'later-link', { confirmed: true })
  assert.equal(await isSlugRetired('later-link'), false)
  await publishFlipbook(owner, flipbook._id)
  assert.equal(await isSlugRetired('later-link'), true)
  assert.equal(stored(flipbook).slug, 'later-link')
})

test("a slug another flipbook published, or another live flipbook uses, is refused; a flipbook may return to its own old link", async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'mine-ab12' })
  slugRegistry.insert({ slug: 'retired-by-someone', flipbookId: newId() })
  await expectPublishError(changeSlug(owner, flipbook._id, 'retired-by-someone'), 409, /not available/)

  // The unique index on live flipbooks: simulated by a duplicate-key error from the update.
  const realUpdate = flipbooks.findOneAndUpdate
  flipbooks.findOneAndUpdate = async () => {
    throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
  }
  try {
    await expectPublishError(changeSlug(owner, flipbook._id, 'used-by-a-live-flipbook'), 409, /not available/)
  } finally {
    flipbooks.findOneAndUpdate = realUpdate
  }

  await publishFlipbook(owner, flipbook._id)
  await changeSlug(owner, flipbook._id, 'second-link', { confirmed: true })
  await changeSlug(owner, flipbook._id, 'mine-ab12', { confirmed: true })
  assert.equal(stored(flipbook).slug, 'mine-ab12')
  assert.equal(stored(flipbook).isPublished, true)
})

test("another user's, a missing or a deleting flipbook cannot change its link", async () => {
  const owner = addUser()
  const intruder = addUser()
  const flipbook = addFlipbook(owner, { slug: 'kept-ab12' })
  await expectPublishError(changeSlug(intruder, flipbook._id, 'stolen-link'), 404)
  await expectPublishError(changeSlug(owner, newId(), 'whatever-link'), 404)
  const deleting = addFlipbook(owner, { status: 'deleting' })
  await expectPublishError(changeSlug(owner, deleting._id, 'new-link'), 409, /being deleted/)
  assert.equal(stored(flipbook).slug, 'kept-ab12')
})

test('a link change racing a publish of the same flipbook leaves one consistent, reserved slug', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'race-ab12' })
  await Promise.allSettled([publishFlipbook(owner, flipbook._id), changeSlug(owner, flipbook._id, 'race-new-link')])
  const final = stored(flipbook)
  assert.equal(final.isPublished, true)
  // Whatever the order, the live slug is reserved for this flipbook.
  assert.ok(reservationsFor(flipbook).some((reservation) => reservation.slug === final.slug))
  assert.equal(users.documents.find((user) => user._id === owner._id).publishLock.token, null)
})

test('a deletion that starts during a link change leaves the flipbook unchanged', async () => {
  const owner = addUser()
  const flipbook = addFlipbook(owner, { slug: 'deleted-mid-change' })
  await Promise.allSettled([
    changeSlug(owner, flipbook._id, 'never-applied'),
    flipbooks.findOneAndUpdate({ _id: flipbook._id }, { $set: { status: 'deleting', isPublished: false } }),
  ])
  assert.equal(stored(flipbook).status, 'deleting')
  assert.ok(['deleted-mid-change', 'never-applied'].includes(stored(flipbook).slug))
  assert.equal(stored(flipbook).isPublished, false)
})
