import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LINK_PREVIEW_USER_AGENTS,
  SOCIAL_MARKERS,
  createSocialPreviewHandler,
  describeFlipbook,
  injectSocialPreview,
  requestOrigin,
  socialImageUrl,
  socialPreviewTags,
} from './socialPreview.js'

const API = 'https://craftflip-api.up.railway.app'
const SHELL = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

// What the public API returns for a published flipbook (backend publicFlipbookController.js).
const PUBLIC_FLIPBOOK = {
  slug: 'boutique-home-group-florida-x7k2',
  title: 'Boutique Home Group Florida',
  viewerStyle: 'luxury-flip',
  reader: { primaryColor: null, background: { kind: 'default' }, logo: null, cta: null, allowDownload: false },
  pageCount: 20,
  pages: [{ pageNumber: 1, width: 1600, height: 2071 }],
  socialImage: { width: 1200, height: 630, revision: 1792310400000 },
}

function metaContent(html, key) {
  const match = new RegExp(`<meta (?:property|name)="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)" />`).exec(html)
  return match ? match[1] : null
}

function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

// A fetch that answers the shell request and the public API like the deployed site would.
function fakeFetch({ api = () => Response.json({ success: true, data: { flipbook: PUBLIC_FLIPBOOK } }), shell = () => new Response(SHELL) } = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push(url)
    assert.ok(options?.signal, 'every request has a timeout')
    if (url.endsWith('/index.html')) return shell(url)
    return api(url)
  }
  return { fetchImpl, calls }
}

async function crawl(slug, { fetch = fakeFetch(), apiBaseUrl = API, headers = { host: 'flip.thecraftaxis.com', 'x-forwarded-proto': 'https' } } = {}) {
  const handler = createSocialPreviewHandler({ apiBaseUrl, fetchImpl: fetch.fetchImpl })
  const res = fakeResponse()
  await handler({ url: `/api/view?slug=${encodeURIComponent(slug)}`, headers }, res)
  return res
}

// ---------- Tags ----------

test('a published flipbook with an image gets Open Graph and large X card tags with absolute HTTPS addresses', () => {
  const tags = socialPreviewTags({ flipbook: PUBLIC_FLIPBOOK, pageUrl: 'https://flip.thecraftaxis.com/view/boutique-home-group-florida-x7k2', apiBaseUrl: API })
  const byKey = Object.fromEntries(tags.map(([, key, content]) => [key, content]))
  const image = `${API}/api/public/flipbooks/boutique-home-group-florida-x7k2/social-image?v=1792310400000`
  assert.deepEqual(byKey, {
    description: 'Flip through this 20-page flipbook online, on any device.',
    'og:site_name': 'CraftFlip',
    'og:type': 'website',
    'og:title': 'Boutique Home Group Florida',
    'og:description': 'Flip through this 20-page flipbook online, on any device.',
    'og:url': 'https://flip.thecraftaxis.com/view/boutique-home-group-florida-x7k2',
    'og:image': image,
    'og:image:secure_url': image,
    'og:image:type': 'image/jpeg',
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt': 'First page of Boutique Home Group Florida',
    'twitter:card': 'summary_large_image',
    'twitter:title': 'Boutique Home Group Florida',
    'twitter:description': 'Flip through this 20-page flipbook online, on any device.',
    'twitter:image': image,
    'twitter:image:alt': 'First page of Boutique Home Group Florida',
  })
  for (const url of [byKey['og:url'], byKey['og:image'], byKey['twitter:image']]) assert.match(url, /^https:\/\//)
})

test('without an image the card is the small summary with no image tags', () => {
  const tags = socialPreviewTags({ flipbook: { ...PUBLIC_FLIPBOOK, socialImage: null }, pageUrl: 'https://flip.thecraftaxis.com/view/x', apiBaseUrl: API })
  const keys = tags.map(([, key]) => key)
  assert.ok(!keys.some((key) => key.includes('image')))
  assert.deepEqual(tags.find(([, key]) => key === 'twitter:card'), ['name', 'twitter:card', 'summary'])
})

test('the image address is built only from a valid slug, a revision and an http(s) API address', () => {
  assert.equal(socialImageUrl(`${API}/`, PUBLIC_FLIPBOOK), `${API}/api/public/flipbooks/${PUBLIC_FLIPBOOK.slug}/social-image?v=1792310400000`)
  assert.equal(socialImageUrl(undefined, PUBLIC_FLIPBOOK), null)
  assert.equal(socialImageUrl('not a url', PUBLIC_FLIPBOOK), null)
  assert.equal(socialImageUrl('javascript:alert(1)', PUBLIC_FLIPBOOK), null)
  assert.equal(socialImageUrl(API, { ...PUBLIC_FLIPBOOK, slug: '../../secret' }), null)
  assert.equal(socialImageUrl(API, { ...PUBLIC_FLIPBOOK, socialImage: { revision: 'x' } }), null)
})

test('descriptions use the page count when it is known', () => {
  assert.equal(describeFlipbook(1), 'Flip through this 1-page flipbook online, on any device.')
  assert.equal(describeFlipbook(null), 'Flip through this flipbook online, on any device.')
})

test('titles are escaped in tags and in the page title, including characters replace() treats specially', () => {
  const flipbook = { ...PUBLIC_FLIPBOOK, title: `"><script>alert('x')</script> & $& $' $1` }
  const html = injectSocialPreview(SHELL, { title: `${flipbook.title} · CraftFlip`, tags: socialPreviewTags({ flipbook, pageUrl: null, apiBaseUrl: API }) })
  assert.doesNotMatch(html, /<script>alert/)
  assert.equal(metaContent(html, 'og:title'), '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; $&amp; $&#39; $1')
  assert.match(html, /<title>&quot;&gt;&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; \$&amp; \$&#39; \$1 · CraftFlip<\/title>/)
})

// ---------- index.html ----------

test('index.html has one generic block between the markers, and injecting replaces it without touching the app', () => {
  assert.equal(SHELL.split(SOCIAL_MARKERS.start).length, 2)
  assert.equal(SHELL.split(SOCIAL_MARKERS.end).length, 2)
  assert.equal(metaContent(SHELL, 'og:title'), 'CraftFlip')

  const html = injectSocialPreview(SHELL, { title: 'Boutique · CraftFlip', tags: socialPreviewTags({ flipbook: PUBLIC_FLIPBOOK, pageUrl: null, apiBaseUrl: API }) })
  assert.equal(html.match(/property="og:title"/g).length, 1)
  assert.equal(metaContent(html, 'og:title'), 'Boutique Home Group Florida')
  assert.match(html, /<title>Boutique · CraftFlip<\/title>/)
  // The app itself is unchanged.
  assert.ok(html.includes('<div id="root"></div>'))
  assert.ok(html.includes('<script type="module" src="/src/main.jsx"></script>'))
  assert.equal(html.slice(html.indexOf(SOCIAL_MARKERS.end)), SHELL.slice(SHELL.indexOf(SOCIAL_MARKERS.end)))
})

test('a page without markers gets the tags before </head>', () => {
  const html = injectSocialPreview('<html><head><title>x</title></head><body><div id="root"></div></body></html>', { title: 'T', tags: [['property', 'og:title', 'T']] })
  assert.match(html, /<meta property="og:title" content="T" \/>\n    <!-- social-preview:end -->\n  <\/head>/)
})

// ---------- The handler (api/view.js) ----------

test('a crawler gets the app page with the flipbook tags, a 200, no caching and noindex', async () => {
  const fetch = fakeFetch()
  const res = await crawl(PUBLIC_FLIPBOOK.slug, { fetch })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow')
  assert.equal(metaContent(res.body, 'og:title'), 'Boutique Home Group Florida')
  assert.equal(metaContent(res.body, 'og:url'), 'https://flip.thecraftaxis.com/view/boutique-home-group-florida-x7k2')
  assert.equal(metaContent(res.body, 'og:image'), `${API}/api/public/flipbooks/boutique-home-group-florida-x7k2/social-image?v=1792310400000`)
  assert.ok(res.body.includes('<div id="root"></div>'))
  assert.deepEqual(fetch.calls.sort(), [`${API}/api/public/flipbooks/boutique-home-group-florida-x7k2`, 'https://flip.thecraftaxis.com/index.html'])
})

test('nothing private reaches the page: only the title, page count and image address from the public API', async () => {
  const leaky = { ...PUBLIC_FLIPBOOK, ownerId: 'owner-123', pdfAsset: { publicId: 'craftflip/users/u/flipbooks/f/original.pdf' }, pages: [{ publicId: 'craftflip/users/u/pages/page-001' }] }
  const res = await crawl(PUBLIC_FLIPBOOK.slug, { fetch: fakeFetch({ api: () => Response.json({ success: true, data: { flipbook: leaky } }) }) })
  assert.doesNotMatch(res.body, /owner-123|craftflip\/users|original\.pdf|cloudinary|\/pages\//i)
})

test('an unpublished or unknown flipbook is a 404 with only the generic tags', async () => {
  const fetch = fakeFetch({ api: () => Response.json({ success: false, message: 'Flipbook not found.' }, { status: 404 }) })
  const res = await crawl('unpublished-book-ab12', { fetch })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body, SHELL)
  assert.equal(metaContent(res.body, 'og:title'), 'CraftFlip')
})

test('a malformed slug is a 404 without asking the API', async () => {
  for (const slug of ['', '../admin', 'UPPER', 'a--b', 'x'.repeat(81)]) {
    const fetch = fakeFetch()
    const res = await crawl(slug, { fetch })
    assert.equal(res.statusCode, 404, slug)
    assert.deepEqual(fetch.calls, ['https://flip.thecraftaxis.com/index.html'])
  }
})

test('when the API fails, is slow or answers oddly, the crawler still gets the working app page', async () => {
  for (const api of [
    () => new Response('oops', { status: 502 }),
    () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    },
    () => new Response('not json'),
    () => Response.json({ success: true, data: { flipbook: { ...PUBLIC_FLIPBOOK, slug: 'another-book-zz99' } } }),
  ]) {
    const res = await crawl(PUBLIC_FLIPBOOK.slug, { fetch: fakeFetch({ api }) })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body, SHELL)
  }
  const unconfigured = await crawl(PUBLIC_FLIPBOOK.slug, { apiBaseUrl: '' })
  assert.equal(unconfigured.statusCode, 200)
  assert.equal(unconfigured.body, SHELL)
})

test('without index.html a minimal page still carries the tags and a link to the flipbook', async () => {
  const res = await crawl(PUBLIC_FLIPBOOK.slug, { fetch: fakeFetch({ shell: () => new Response('gone', { status: 404 }) }) })
  assert.equal(res.statusCode, 200)
  assert.match(res.body, /^<!doctype html>/)
  assert.equal(metaContent(res.body, 'og:title'), 'Boutique Home Group Florida')
  assert.ok(metaContent(res.body, 'og:image'))
  assert.match(res.body, /<a href="https:\/\/flip\.thecraftaxis\.com\/view\/boutique-home-group-florida-x7k2">Boutique Home Group Florida · CraftFlip<\/a>/)

  const missing = await crawl('gone-book-ab12', {
    fetch: fakeFetch({ shell: () => new Response('gone', { status: 404 }), api: () => new Response('{}', { status: 404 }) }),
  })
  assert.equal(missing.statusCode, 404)
  assert.match(missing.body, /This flipbook doesn&#39;t exist or has been removed\./)
})

test('a flipbook without an image gets a small card; the page is never broken', async () => {
  const res = await crawl(PUBLIC_FLIPBOOK.slug, {
    fetch: fakeFetch({ api: () => Response.json({ success: true, data: { flipbook: { ...PUBLIC_FLIPBOOK, socialImage: null } } }) }),
  })
  assert.equal(res.statusCode, 200)
  assert.equal(metaContent(res.body, 'twitter:card'), 'summary')
  assert.equal(metaContent(res.body, 'og:image'), null)
})

test('the page address comes from the request host only when it looks like a host name', () => {
  assert.equal(requestOrigin({ host: 'flip.thecraftaxis.com', 'x-forwarded-proto': 'https' }), 'https://flip.thecraftaxis.com')
  assert.equal(requestOrigin({ 'x-forwarded-host': 'Flip.TheCraftAxis.com', host: 'internal' }), 'https://flip.thecraftaxis.com')
  assert.equal(requestOrigin({ host: 'localhost:4173', 'x-forwarded-proto': 'http' }), 'http://localhost:4173')
  assert.equal(requestOrigin({ host: 'evil.example/"><script>' }), null)
  assert.equal(requestOrigin({}), null)
})

// ---------- vercel.json ----------

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const crawlerRule = vercel.rewrites[0]
// Vercel matches the whole header value.
const crawlerPattern = new RegExp(`^${crawlerRule.has[0].value}$`)

test('vercel.json sends crawlers for /view/<slug> to the function before the app rewrite, using the same pattern', () => {
  assert.equal(crawlerRule.source, '/view/:slug')
  assert.equal(crawlerRule.destination, '/api/view?slug=:slug')
  assert.deepEqual([crawlerRule.has[0].type, crawlerRule.has[0].key], ['header', 'user-agent'])
  assert.equal(crawlerRule.has[0].value, LINK_PREVIEW_USER_AGENTS)
  assert.deepEqual(vercel.rewrites.at(-1), { source: '/(.*)', destination: '/index.html' })
  assert.ok(vercel.headers.some((rule) => rule.source === '/view/(.*)'))
})

test('the crawler pattern matches link preview fetchers', () => {
  for (const userAgent of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'Twitterbot/1.0',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'WhatsApp/2.23.20.0 A',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'TelegramBot (like TwitterBot)',
    'Pinterest/0.2 (+https://www.pinterest.com/bot.html)',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
    'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)',
    'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)',
    'http.rb/5.1.1 (Mastodon/4.2.1; +https://mastodon.social/)',
  ]) {
    assert.ok(crawlerPattern.test(userAgent), userAgent)
  }
})

test('the crawler pattern never matches browsers or in-app browsers, which must get the normal app', () => {
  for (const userAgent of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0;FBBV/1;FBDV/iPhone15,2]',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.30',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Pinterest for iOS/12.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ]) {
    assert.ok(!crawlerPattern.test(userAgent), userAgent)
  }
})

test('api/view.js wires the handler to the existing API address variable', () => {
  const source = readFileSync(new URL('../../api/view.js', import.meta.url), 'utf8')
  assert.match(source, /createSocialPreviewHandler\(\{ apiBaseUrl: process\.env\.VITE_API_BASE_URL \}\)/)
})
