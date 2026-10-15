import axios from 'axios'
import { auth } from '../firebase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// Attach the signed-in user's Firebase ID token. getIdToken() returns a cached token and
// refreshes it automatically when it is close to expiring; nothing is stored by the app.
api.interceptors.request.use(async (config) => {
  await auth.authStateReady()
  const currentUser = auth.currentUser
  if (currentUser) {
    const idToken = await currentUser.getIdToken()
    config.headers.Authorization = `Bearer ${idToken}`
  }
  return config
})

export default api
