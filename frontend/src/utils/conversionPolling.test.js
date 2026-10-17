import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startConversionPolling } from './conversionPolling.js'

// A manual clock: run() fires the pending timer, like one poll interval passing.
function fakeTimers() {
  let pending = null
  return {
    setTimer: (callback) => (pending = callback),
    clearTimer: () => (pending = null),
    async run() {
      const callback = pending
      pending = null
      await callback?.()
    },
    get scheduled() {
      return pending !== null
    },
  }
}

test('each round asks for every processing flipbook and reports its server state', async () => {
  const timers = fakeTimers()
  const updates = []
  startConversionPolling({
    ids: ['a', 'b'],
    intervalMs: 2000,
    fetchFlipbook: async (id) => ({ id, status: 'processing', conversionProgress: { stage: 'converting', completedPages: 3, totalPages: 20, percent: 15 } }),
    onUpdate: (id, flipbook) => updates.push([id, flipbook.conversionProgress.completedPages]),
    ...timers,
  })
  await timers.run()
  assert.deepEqual(updates, [['a', 3], ['b', 3]])
  assert.equal(timers.scheduled, true)
})

test('the next round starts only after the previous one finished', async () => {
  const timers = fakeTimers()
  let inFlight = 0
  let maxInFlight = 0
  startConversionPolling({
    ids: ['a', 'b', 'c'],
    intervalMs: 2000,
    fetchFlipbook: async (id) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setImmediate(resolve))
      inFlight--
      return { id }
    },
    onUpdate: () => {},
    ...timers,
  })
  const round = timers.run()
  assert.equal(timers.scheduled, false)
  await round
  assert.equal(maxInFlight, 1)
  assert.equal(timers.scheduled, true)
})

test('after stop no update is delivered and nothing more is scheduled', async () => {
  const timers = fakeTimers()
  const updates = []
  let release
  const stop = startConversionPolling({
    ids: ['a'],
    intervalMs: 2000,
    fetchFlipbook: () => new Promise((resolve) => (release = () => resolve({ id: 'a', status: 'ready' }))),
    onUpdate: (id, flipbook) => updates.push(flipbook.status),
    ...timers,
  })
  const round = timers.run()
  stop()
  release()
  await round
  assert.deepEqual(updates, [])
  assert.equal(timers.scheduled, false)
})

test('a failed status check is retried on the next round', async () => {
  const timers = fakeTimers()
  let calls = 0
  const updates = []
  startConversionPolling({
    ids: ['a'],
    intervalMs: 2000,
    fetchFlipbook: async () => {
      calls++
      if (calls === 1) throw new Error('Network Error')
      return { status: 'ready' }
    },
    onUpdate: (id, flipbook) => updates.push(flipbook.status),
    ...timers,
  })
  await timers.run()
  await timers.run()
  assert.deepEqual(updates, ['ready'])
})
