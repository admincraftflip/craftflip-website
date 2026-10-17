import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as tick } from 'node:timers/promises'
import { createPageImageStore } from './pageImageStore.js'

// URL.createObjectURL is a browser API; the store only needs a unique string per image.
let nextUrl = 0
globalThis.URL.createObjectURL ??= () => `blob:test-${nextUrl++}`
globalThis.URL.revokeObjectURL ??= () => {}

function fakeLoader() {
  const requested = []
  const loadPage = async (pageNumber, signal) => {
    requested.push(pageNumber)
    await tick()
    if (signal.aborted) throw new Error('aborted')
    return new Blob([`page ${pageNumber}`])
  }
  return { requested, loadPage }
}

async function settle() {
  for (let round = 0; round < 10; round++) await tick()
}

test('on a normal mount the open page and its neighbours load', async () => {
  const { requested, loadPage } = fakeLoader()
  const store = createPageImageStore(loadPage, 20)
  store.open()
  store.setFocus(1)
  await settle()
  assert.equal(store.get(1)?.status, 'loaded')
  assert.deepEqual([...new Set(requested)].sort((a, b) => a - b), [1, 2, 3, 4, 5])
})

// The order React uses in development (StrictMode) when the store lives in FlipbookReader and the
// reader asks for pages in its own effect: child effects run before the parent's, and every
// effect is run, cleaned up and run again. The reader's second request arrives while the store
// is still closed; the store must load once it is opened again. This was the blank first page.
test('pages asked for while the store is closed load as soon as it is opened again', async () => {
  const { loadPage } = fakeLoader()
  const store = createPageImageStore(loadPage, 20)

  store.setFocus(1) // reader effect (child runs first)
  store.open() // FlipbookReader effect
  store.close() // StrictMode: cleanup
  store.setFocus(1) // StrictMode: reader effect again, store still closed
  store.open() // StrictMode: FlipbookReader effect again

  await settle()
  assert.equal(store.get(1)?.status, 'loaded', 'page 1 is shown without switching style')
  assert.equal(store.get(2)?.status, 'loaded')
})

test('listeners hear about pages that load after the store is reopened', async () => {
  const { loadPage } = fakeLoader()
  const store = createPageImageStore(loadPage, 3)
  let notified = 0
  store.subscribe(() => notified++)
  store.close()
  store.setFocus(1)
  store.open()
  await settle()
  assert.ok(notified > 0)
  assert.equal(store.get(1)?.status, 'loaded')
})

test('closing stops further loading and frees the images', async () => {
  const { requested, loadPage } = fakeLoader()
  const store = createPageImageStore(loadPage, 20)
  store.open()
  store.setFocus(1)
  store.close()
  await settle()
  assert.equal(store.get(1), undefined)
  const countAfterClose = requested.length
  store.setFocus(10)
  await settle()
  assert.equal(requested.length, countAfterClose, 'nothing is requested while closed')
})

test('a style switch (a new reader on the same open store) keeps loaded pages and loads new ones', async () => {
  const { requested, loadPage } = fakeLoader()
  const store = createPageImageStore(loadPage, 20)
  store.open()
  store.setFocus(1)
  await settle()
  const firstUrl = store.get(1).url
  store.setFocus(1) // the new reader asks for the same page
  store.setFocus(9)
  await settle()
  assert.equal(store.get(1).url, firstUrl)
  assert.equal(store.get(9)?.status, 'loaded')
  assert.equal(requested.filter((pageNumber) => pageNumber === 1).length, 1)
})
