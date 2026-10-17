import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDeletion, requestDeletion } from './flipbookDeletion.js'

const LIST = [
  { id: 'a', title: 'Listing', status: 'ready' },
  { id: 'b', title: 'Resume', status: 'ready' },
]

function apiError(status, message) {
  return Object.assign(new Error('Request failed'), { response: { status, data: { success: false, message } } })
}

function fakeClient({ deleteError = null, refreshed = null, refreshError = null } = {}) {
  const calls = []
  return {
    calls,
    async delete(url) {
      calls.push(['delete', url])
      if (deleteError) throw deleteError
      return { data: { success: true } }
    },
    async get(url) {
      calls.push(['get', url])
      if (refreshError) throw refreshError
      return { data: { success: true, data: { flipbook: refreshed } } }
    },
  }
}

test('a successful deletion removes only that row from the dashboard', async () => {
  const client = fakeClient()
  const result = await requestDeletion(client, 'a')
  assert.deepEqual(client.calls, [['delete', '/api/flipbooks/a']])
  assert.deepEqual(applyDeletion(LIST, 'a', result), [LIST[1]])
})

test('a flipbook that no longer exists is removed from the dashboard', async () => {
  const result = await requestDeletion(fakeClient({ deleteError: apiError(404, 'Flipbook not found.') }), 'a')
  assert.equal(result.outcome, 'gone')
  assert.deepEqual(applyDeletion(LIST, 'a', result), [LIST[1]])
})

test('a failed deletion keeps the row and shows its current server state, so it can be retried', async () => {
  const refreshed = { id: 'a', title: 'Listing', status: 'deleting' }
  const client = fakeClient({ deleteError: apiError(502, "We couldn't delete all of this flipbook's files."), refreshed })
  const result = await requestDeletion(client, 'a')

  assert.equal(result.outcome, 'failed')
  assert.equal(result.message, "We couldn't delete all of this flipbook's files.")
  assert.deepEqual(applyDeletion(LIST, 'a', result), [refreshed, LIST[1]])
})

test('a refused deletion (conversion running) keeps the row as it is on the server', async () => {
  const refreshed = { id: 'a', title: 'Listing', status: 'processing' }
  const result = await requestDeletion(fakeClient({ deleteError: apiError(409, 'Still converting.'), refreshed }), 'a')
  assert.equal(result.outcome, 'failed')
  assert.deepEqual(applyDeletion(LIST, 'a', result)[0], refreshed)
})

test('a network failure keeps the dashboard unchanged with a generic message', async () => {
  const client = fakeClient({ deleteError: new Error('Network Error'), refreshError: new Error('Network Error') })
  const result = await requestDeletion(client, 'a')
  assert.equal(result.message, 'Something went wrong. Please try again.')
  assert.equal(applyDeletion(LIST, 'a', result), LIST)
})
