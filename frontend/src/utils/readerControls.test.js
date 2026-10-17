import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ZOOM_LEVELS,
  createThumbnailStore,
  fullscreenApi,
  pagesOnScreen,
  parsePageInput,
  toolbarMode,
  zoomIn,
  zoomLayout,
  zoomOut,
} from './readerControls.js'
import { visiblePagesLabel } from './bookLayout.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('zoom steps up and down through fixed levels and stops at both ends; 1 is fit to page', () => {
  assert.equal(ZOOM_LEVELS[0], 1)
  assert.equal(zoomIn(1), 1.5)
  assert.equal(zoomIn(1.5), 2)
  assert.equal(zoomIn(ZOOM_LEVELS.at(-1)), ZOOM_LEVELS.at(-1))
  assert.equal(zoomOut(2), 1.5)
  assert.equal(zoomOut(1), 1)
})

test('zooming enlarges the fitted page and keeps its proportions', () => {
  const fitted = { spread: true, width: 400, height: 518 }
  assert.equal(zoomLayout(fitted, 1), fitted)
  const zoomed = zoomLayout(fitted, 2)
  assert.deepEqual(zoomed, { spread: true, width: 800, height: 1036 })
  assert.ok(Math.abs(zoomed.width / zoomed.height - fitted.width / fitted.height) < 0.01)
})

test('a typed page number is accepted only as a whole page within the book', () => {
  assert.equal(parsePageInput('7', 20), 7)
  assert.equal(parsePageInput(' 20 ', 20), 20)
  assert.equal(parsePageInput('1', 1), 1)
  for (const text of ['0', '21', '-1', '2.5', '1e1', 'abc', '', '  ', null, '00000', '4–5']) {
    assert.equal(parsePageInput(text, 20), null, String(text))
  }
})

test('the pages on screen match the page label in the page-flip styles, on spreads and single pages', () => {
  const cases = [
    [0, 10, true, [1]],
    [1, 10, true, [2, 3]],
    [2, 10, true, [2, 3]],
    [9, 10, true, [10]],
    [8, 9, true, [9]],
    [4, 10, false, [5]],
  ]
  for (const [pageIndex, pageCount, spread, expected] of cases) {
    const onScreen = pagesOnScreen(pageIndex, pageCount, spread)
    assert.deepEqual(onScreen, expected, `${pageIndex}/${pageCount}/${spread}`)
    assert.equal(visiblePagesLabel(pageIndex, pageCount, spread), onScreen.join('–'))
  }
})

test('the toolbar shows every control on wide stages and fewer on phones', () => {
  assert.equal(toolbarMode(1440), 'full')
  assert.equal(toolbarMode(600), 'full')
  assert.equal(toolbarMode(390), 'compact')
  assert.equal(toolbarMode(340), 'compact')
  assert.equal(toolbarMode(320), 'minimal')
})

function fakeLoader() {
  const calls = []
  const pending = new Map()
  const load = (pageNumber, signal) =>
    new Promise((resolve, reject) => {
      calls.push(pageNumber)
      pending.set(pageNumber, { resolve, reject })
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  return { load, calls, pending }
}

test('previews load only for requested pages, a few at a time, each once', async () => {
  const loader = fakeLoader()
  const store = createThumbnailStore(loader.load)
  for (const pageNumber of [1, 2, 3, 4, 5, 6]) store.request(pageNumber)
  assert.equal(loader.calls.length, 4)
  store.request(2)
  assert.equal(loader.calls.length, 4)
  assert.equal(store.get(6).status, 'queued')

  loader.pending.get(1).resolve(new Blob(['webp']))
  await tick()
  assert.equal(store.get(1).status, 'loaded')
  assert.match(store.get(1).url, /^blob:/)
  assert.equal(loader.calls.length, 5)
  store.request(1)
  assert.equal(loader.calls.length, 5)
  assert.equal(loader.calls.includes(7), false)
  store.close()
})

test('a failed preview is marked and can be asked for again; a preview scrolled away before it starts is skipped', async () => {
  const loader = fakeLoader()
  const store = createThumbnailStore(loader.load)
  for (const pageNumber of [1, 2, 3, 4, 5]) store.request(pageNumber)
  store.cancel(5)
  assert.equal(store.get(5), undefined)
  loader.pending.get(1).reject(new Error('502'))
  await tick()
  assert.equal(store.get(1).status, 'failed')
  assert.equal(loader.calls.includes(5), false)
  store.request(1)
  assert.equal(loader.calls.filter((page) => page === 1).length, 2)
  // Loading pages are not cancelled.
  store.cancel(2)
  assert.equal(store.get(2).status, 'loading')
  store.close()
})

test('closing stops all loading and frees the previews', async () => {
  const loader = fakeLoader()
  const store = createThumbnailStore(loader.load)
  store.request(1)
  loader.pending.get(1).resolve(new Blob(['webp']))
  await tick()
  let notified = 0
  store.subscribe(() => notified++)
  store.request(2)
  store.close()
  assert.equal(store.get(1), undefined)
  const callsBefore = loader.calls.length
  store.request(3)
  await tick()
  assert.equal(loader.calls.length, callsBefore)
  assert.ok(notified >= 1)
})

test('fullscreen uses the standard API, falls back to the webkit names, and reports when it is unavailable', async () => {
  assert.equal(fullscreenApi(undefined).supported, false)
  assert.equal(fullscreenApi({ fullscreenEnabled: false }).supported, false)
  assert.equal(fullscreenApi({}).supported, false)

  const calls = []
  const standard = { fullscreenEnabled: true, fullscreenElement: null, exitFullscreen: async () => calls.push('exit') }
  const api = fullscreenApi(standard)
  assert.equal(api.supported, true)
  await api.enter({ requestFullscreen: async () => calls.push('enter') })
  await api.exit()
  assert.deepEqual(calls, ['enter'])
  standard.fullscreenElement = {}
  await api.exit()
  assert.deepEqual(calls, ['enter', 'exit'])

  const webkit = { webkitFullscreenEnabled: true, webkitFullscreenElement: {}, webkitExitFullscreen: async () => calls.push('webkit-exit') }
  const prefixed = fullscreenApi(webkit)
  assert.equal(prefixed.supported, true)
  await prefixed.enter({ webkitRequestFullscreen: async () => calls.push('webkit-enter') })
  await prefixed.exit()
  assert.deepEqual(calls.slice(2), ['webkit-enter', 'webkit-exit'])
  assert.ok(prefixed.changeEvents.includes('webkitfullscreenchange'))
})
