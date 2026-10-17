import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { startServer } from './helpers/server.js'

// The real router with the real requireAuth: no report without a valid Firebase token.
const { default: analyticsRoutes } = await import('../routes/analyticsRoutes.js')

const app = express()
app.use('/api/analytics', analyticsRoutes)
const server = await startServer(app)
test.after(() => server.close())

test('analytics reports without a valid bearer token are rejected with 401', async () => {
  for (const path of ['', `/flipbooks/${new mongoose.Types.ObjectId()}`]) {
    for (const headers of [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer' }]) {
      const response = await fetch(`${server.url}/api/analytics${path}`, { headers })
      assert.equal(response.status, 401, `${path} ${JSON.stringify(headers)}`)
      assert.equal((await response.json()).success, false)
    }
  }
})
