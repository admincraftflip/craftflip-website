import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true })

const DEFAULT_DB_NAME = 'craftflip'

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(express.json())

function uriHasDbName(uri) {
  const afterHost = uri.split('://')[1]?.split('?')[0] ?? ''
  const slashIndex = afterHost.indexOf('/')
  return slashIndex !== -1 && afterHost.slice(slashIndex + 1).length > 0
}

async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MongoDB connection error: MONGODB_URI is not set')
    return
  }

  try {
    const options = uriHasDbName(uri) ? {} : { dbName: DEFAULT_DB_NAME }
    await mongoose.connect(uri, options)
    console.log(`MongoDB connected (database: ${mongoose.connection.name})`)
  } catch (error) {
    console.error(`MongoDB connection error: ${error.name}: ${error.message}`)
  }
}

connectDB()

app.get('/', (req, res) => {
  res.json({ success: true, message: 'CraftFlip API is running' })
})

app.get('/api/health', (req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  res.json({ success: true, data: { status: 'ok', database } })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
