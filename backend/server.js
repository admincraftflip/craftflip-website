import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { getFirebaseAuth } from './config/firebaseAdmin.js'
import { getCloudinary } from './config/cloudinary.js'
import { getResendSettings } from './config/resend.js'
import authRoutes from './routes/authRoutes.js'
import flipbookRoutes from './routes/flipbookRoutes.js'
import publicRoutes from './routes/publicRoutes.js'
import analyticsRoutes from './routes/analyticsRoutes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'
import { recoverInterruptedConversions } from './utils/pdfConversion.js'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true })

const DEFAULT_DB_NAME = 'craftflip'

const app = express()

// Railway puts one proxy in front of the app; trust exactly that hop so req.ip is the client IP.
app.set('trust proxy', 1)

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
    await recoverInterruptedConversions()
  } catch (error) {
    console.error(`MongoDB connection error: ${error.name}: ${error.message}`)
  }
}

connectDB()
getFirebaseAuth()
getCloudinary()
getResendSettings()

app.get('/', (req, res) => {
  res.json({ success: true, message: 'CraftFlip API is running' })
})

app.get('/api/health', (req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  res.json({ success: true, data: { status: 'ok', database } })
})

app.use('/api/auth', authRoutes)
app.use('/api/flipbooks', flipbookRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/analytics', analyticsRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
