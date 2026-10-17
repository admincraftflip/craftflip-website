import { getFirebaseAuth } from '../config/firebaseAdmin.js'
import User from '../models/User.js'
import { scheduleWelcomeEmail } from '../utils/welcomeEmail.js'

const DUPLICATE_KEY_ERROR = 11000

function extractBearerToken(header) {
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme === 'Bearer' && token ? token : null
}

// Profile fields come from the verified token claims; missing claims are left untouched.
function profileFromToken(decodedToken) {
  const profile = {}
  if (decodedToken.email) profile.email = decodedToken.email
  if (decodedToken.name) profile.displayName = decodedToken.name
  if (decodedToken.picture) profile.photoURL = decodedToken.picture
  return profile
}

async function findOrCreateUser(decodedToken) {
  const filter = { firebaseUid: decodedToken.uid }
  // A new account starts with a pending welcome email; existing accounts are never touched by it.
  const update = {
    $set: profileFromToken(decodedToken),
    $setOnInsert: { firebaseUid: decodedToken.uid, 'welcomeEmail.status': 'pending' },
  }
  const options = { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }

  try {
    return await User.findOneAndUpdate(filter, update, options)
  } catch (error) {
    // Two concurrent first sign-ins can both attempt the insert; the unique index rejects
    // the second, which then updates the document the first one created.
    if (error.code === DUPLICATE_KEY_ERROR) {
      return User.findOneAndUpdate(filter, update, { ...options, upsert: false })
    }
    throw error
  }
}

export async function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization)
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable.' })
  }

  let decodedToken
  try {
    decodedToken = await firebaseAuth.verifyIdToken(token)
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please sign in again.' })
  }

  try {
    req.user = await findOrCreateUser(decodedToken)
  } catch (error) {
    console.error(`Auth user lookup failed: ${error.name}`)
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
  }

  // Not awaited and never throws: email problems cannot delay or fail sign-in.
  scheduleWelcomeEmail(req.user)
  next()
}
