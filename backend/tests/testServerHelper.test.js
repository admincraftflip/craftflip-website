import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { FETCH_BLOCKED_PORTS, startServer } from './helpers/server.js'

// The OS picked 4190 (blocked by fetch) for a test server and every HTTP test in that file failed.
test('a test server never keeps a port that fetch refuses to connect to', async () => {
  const offered = [4190, 6000, 10080, 5555]
  const closed = []
  const fakeListen = async () => {
    const port = offered.shift()
    return { address: () => ({ port }), close: () => closed.push(port) }
  }

  const server = await startServer(express(), fakeListen)
  assert.equal(server.url, 'http://127.0.0.1:5555')
  assert.deepEqual(closed, [4190, 6000, 10080])
})

test('a real test server answers fetch', async () => {
  const app = express()
  app.get('/', (req, res) => res.json({ success: true }))
  const server = await startServer(app)
  try {
    assert.ok(!FETCH_BLOCKED_PORTS.has(Number(new URL(server.url).port)))
    assert.deepEqual(await (await fetch(server.url)).json(), { success: true })
  } finally {
    server.close()
  }
})
