import { v2 as cloudinary } from 'cloudinary'

const REQUIRED_VARIABLES = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']

let configuredCloudinary = null
let initialized = false

function initCloudinary() {
  const missingVariables = REQUIRED_VARIABLES.filter((name) => !process.env[name])
  if (missingVariables.length > 0) {
    console.error(`Cloudinary not configured: missing ${missingVariables.join(', ')}`)
    return null
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  console.log(`Cloudinary configured (cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`)
  return cloudinary
}

// Initialized lazily so it runs after dotenv has loaded backend/.env.
export function getCloudinary() {
  if (!initialized) {
    configuredCloudinary = initCloudinary()
    initialized = true
  }
  return configuredCloudinary
}
