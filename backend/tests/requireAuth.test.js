import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { startServer } from './helpers/server.js'

const app = express()
app.get('/protected', requireAuth, (req, res) => res.json({ success: true }))

test('requests without a bearer token get a structured 401', async (t) => {
  const server = await startServer(app)
  t.after(() => server.close())

  for (const headers of [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer' }]) {
    const response = await fetch(`${server.url}/protected`, { headers })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { success: false, message: 'Authentication required.' })
  }
})
