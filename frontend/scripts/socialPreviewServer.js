import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createSocialPreviewHandler } from '../src/utils/socialPreview.js'

// Local check of link previews (Milestone 13), without deploying: serves the production build
// (npm run build) and, like vercel.json on Vercel, sends link preview crawlers' requests for
// /view/<slug> to the same handler as api/view.js. Everyone else gets the app. Not used on Vercel.
// Run: npm run build && npm run preview:social, then for example
//   curl -A "facebookexternalhit/1.1" http://localhost:4173/view/<slug>

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' }

// The file in dist for a request path, or null (the app's index.html is served instead). Malformed
// encodings and anything that resolves outside dist, such as an encoded "../", are refused.
export function staticFilePath(dist, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const file = join(dist, decoded)
  const inside = relative(dist, file)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  return extname(file) && existsSync(file) ? file : null
}

function sendFile(res, path) {
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' })
  res.end(readFileSync(path))
}

function start() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const dist = join(root, 'dist')
  const port = Number(process.env.PORT) || 4173

  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('No production build found. Run npm run build first.')
    process.exit(1)
  }

  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  const crawlerPattern = new RegExp(`^${vercel.rewrites[0].has[0].value}$`)
  const handler = createSocialPreviewHandler({ apiBaseUrl: process.env.VITE_API_BASE_URL })

  createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    const viewMatch = /^\/view\/([^/]+)$/.exec(pathname)
    if (viewMatch && crawlerPattern.test(req.headers['user-agent'] ?? '')) {
      req.url = `/api/view?slug=${viewMatch[1]}`
      req.headers['x-forwarded-proto'] = 'http'
      console.log(`crawler  ${pathname} -> social preview handler`)
      return handler(req, res)
    }
    sendFile(res, staticFilePath(dist, pathname) ?? join(dist, 'index.html'))
  }).listen(port, () => console.log(`Social preview check on http://localhost:${port} (API: ${process.env.VITE_API_BASE_URL || 'not set'})`))
}

// Started only when run as a script, so the tests can import staticFilePath.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start()
