import { createSocialPreviewHandler } from '../src/utils/socialPreview.js'

// Vercel Function for link previews of public flipbooks (Milestone 13). vercel.json routes only
// link preview crawlers' requests for /view/<slug> here; visitors get the static app as before.
// VITE_API_BASE_URL is the same Railway API address the app is built with (Vercel passes project
// variables to functions too), so no new variable is needed.
export default createSocialPreviewHandler({ apiBaseUrl: process.env.VITE_API_BASE_URL })
