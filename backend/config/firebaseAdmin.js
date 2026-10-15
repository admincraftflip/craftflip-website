import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const LOCAL_SERVICE_ACCOUNT_PATH = fileURLToPath(
  new URL('../firebase-service-account.json', import.meta.url)
)

const REQUIRED_FIELDS = ['project_id', 'client_email', 'private_key']

class FirebaseConfigError extends Error {}

let firebaseAuth = null
let initialized = false

function loadServiceAccount() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (fromEnv) {
    try {
      return { serviceAccount: JSON.parse(fromEnv), source: 'FIREBASE_SERVICE_ACCOUNT_JSON' }
    } catch {
      throw new FirebaseConfigError('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON')
    }
  }

  if (existsSync(LOCAL_SERVICE_ACCOUNT_PATH)) {
    try {
      const fileContents = readFileSync(LOCAL_SERVICE_ACCOUNT_PATH, 'utf8')
      return { serviceAccount: JSON.parse(fileContents), source: 'firebase-service-account.json' }
    } catch {
      throw new FirebaseConfigError('firebase-service-account.json is not valid JSON')
    }
  }

  throw new FirebaseConfigError(
    'no credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON or add backend/firebase-service-account.json'
  )
}

function initFirebaseAdmin() {
  try {
    const { serviceAccount, source } = loadServiceAccount()

    const missingFields = REQUIRED_FIELDS.filter((field) => !serviceAccount?.[field])
    if (missingFields.length > 0) {
      throw new FirebaseConfigError(`service account from ${source} is missing: ${missingFields.join(', ')}`)
    }

    const app = initializeApp({ credential: cert(serviceAccount) })
    console.log(`Firebase Admin initialized (project: ${serviceAccount.project_id}, source: ${source})`)
    return getAuth(app)
  } catch (error) {
    // SDK error text can echo credential details, so only our own messages are logged.
    const reason = error instanceof FirebaseConfigError ? error.message : 'service account credentials were rejected'
    console.error(`Firebase Admin not configured: ${reason}`)
    return null
  }
}

// Initialized lazily so it runs after dotenv has loaded backend/.env.
export function getFirebaseAuth() {
  if (!initialized) {
    firebaseAuth = initFirebaseAdmin()
    initialized = true
  }
  return firebaseAuth
}
