import axios from 'axios'

// For the public viewer only. Unlike utils/api.js it never loads Firebase and never sends a
// token: public endpoints serve published flipbooks to anyone and ignore credentials.
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export default publicApi
