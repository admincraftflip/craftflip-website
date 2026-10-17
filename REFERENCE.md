# REFERENCE.md — Technical Decisions and Architecture Notes

This file records why we made specific technical choices.
When a decision changes, update this file with the reason.
Distinguish confirmed decisions from options still under evaluation.

---

## Why React + Vite and not Next.js

ChatGPT suggested Next.js. Decision: React + Vite.

Reasons:
- Project owner already knows MERN stack
- A flipbook viewer is a highly interactive client-side app, not a content site that needs SSR
- Vite is faster to develop with at this stage
- Fewer concepts to learn simultaneously
- Next.js can be adopted later if landing page SEO becomes a priority

---

## Why Firebase Auth and not Clerk or custom JWT

Decision: Firebase Auth with three methods (Google, Facebook, email/password).

Reasons:
- Handles all three auth methods in one SDK with minimal backend code
- Free up to 10,000 monthly active users
- Firebase Admin SDK verifies tokens in one call on the backend
- Clients are non-technical and already use Google
- Clerk was suggested but adds a third-party dependency with no benefit at this stage

Important: Firebase ID tokens must not be manually stored in localStorage. Firebase manages its own session persistence. The backend receives the token via Authorization header on each request and verifies it with Firebase Admin SDK.

---

## Why Paddle and not Stripe

Decision: Paddle.

Reasons:
- Stripe does not reliably support payment receiving for businesses in Bangladesh at the time this project started
- Paddle is a merchant of record: handles international tax compliance and VAT
- Supports Payoneer and wire transfer for payouts
- Better fit for a SaaS selling internationally from Bangladesh

Action required before building payment features: confirm Paddle account approval and payout options for Bangladesh at paddle.com.

---

## Why Cloudinary and not Cloudflare R2 or AWS S3

Decision: Cloudinary for initial launch.

Reasons:
- Free tier includes 25GB storage and image transformations
- Built-in CDN delivery globally
- Simple Node.js SDK
- No egress fees on free tier
- Faster to set up than R2 or S3

Future: migrate to Cloudflare R2 when Cloudinary free tier is consistently exceeded. R2 has no egress fees and lower storage cost at scale.

---

## Why Resend and not SendGrid or Nodemailer

Decision: Resend.

Reasons:
- Free tier: 3,000 emails per month
- Simple REST API and Node.js SDK
- No SMTP configuration needed
- Built for developers

Migrate only if Resend free tier is exceeded or a feature requires more advanced email tooling.

---

## Why own analytics and not Plausible, Google Analytics, or Mixpanel

Decision: build analytics into own MongoDB collections.

Reasons:
- Analytics are a paid feature and a selling point of CraftFlip
- Owning the data means full control over what is displayed and how it is gated
- No third-party scripts on viewer pages (affects load performance and privacy)
- No dependency on external services for a core product feature

Privacy note: use a first-party session identifier, not browser fingerprinting. Collect only what is needed (country, device type, referrer). Do not collect personally identifiable information from viewers.

---

## PDF processing pipeline

Status: CONFIRMED. Option B (server-side conversion) implemented in Milestone 4 with pdfjs-dist + @napi-rs/canvas + sharp, approved by the owner in October 2026 in place of pdf2pic. Measurement with a realistic brochure still pending (see Action below).

Two options were evaluated:

Option A: Render PDF pages directly in the browser using PDF.js.
Option B: Convert PDF pages to images server-side, store in Cloudinary, serve images in viewer.

Decision: Option B (server-side conversion).

Reasons for Option B:
- Large design-heavy real estate brochures (20-60 pages, high resolution) can be slow to render in the browser
- Client devices vary widely in performance
- Pre-rendered images load progressively and predictably
- Images served from Cloudinary CDN are fast globally
- Viewer becomes simpler: displays images only, no PDF engine in browser

Rendering engine (Milestone 4):
- The original plan was pdf2pic, which shells out to GraphicsMagick and Ghostscript. Neither was installed on the development PC, and Railway would need extra system packages. The owner approved pdfjs-dist (Mozilla PDF.js) + @napi-rs/canvas instead: plain npm packages with prebuilt binaries for Windows and Linux (Railway), so npm install is the only setup. sharp encodes the WebP output
- pdfjs-dist must stay at 6.2.108 or later: earlier 5.x/6.x versions have a high-severity advisory (GHSA-hq66-cqwq-w95j, JavaScript execution when opening a malicious PDF). PDFs are opened with isEvalSupported false. @napi-rs/canvas must match the version pdfjs-dist depends on, so only one copy is installed (two copies break rendering)
- Requires Node 22.13 or later (package.json engines)

Pipeline:
- POST /api/flipbooks/:id/convert claims the flipbook atomically (findOneAndUpdate from uploaded or failed to processing, filtered by ownerId), returns 202 and queues the job. The dashboard starts it automatically after upload and polls GET /api/flipbooks/:id
- Since the end-to-end timing pass (October 2026), POST /api/flipbooks starts conversion itself when the queue has room: the record is created already claimed (status processing, a new attempt, the same fields the convert endpoint sets) and the job receives the uploaded PDF bytes still in memory. Only a job that starts immediately keeps those bytes; one that must wait in the queue downloads the original when its turn comes, so waiting jobs never hold PDFs in memory. With a full queue the upload is stored as uploaded and the dashboard calls POST /:id/convert as before. Retries and restart recovery always download the original. These conversions count against the upload rate limit (20 per hour) rather than the conversion limit
- In-memory queue, one conversion at a time (at most 20 waiting), so memory stays predictable on one Railway instance. Rendering runs in a worker thread (512MB heap limit) so the event loop is never blocked; the whole conversion times out after 10 minutes
- The original is downloaded through the authenticated Cloudinary API (private_download_url), checked again for the PDF signature and the 50MB limit, then opened. Password-protected and unreadable PDFs fail with a clear message
- Page limit by plan (utils/planLimits.js): free and starter 100, pro 200, read from the MongoDB user. Checked before any page is stored
- Pages render 1600px wide (no side over 4000px), white background, WebP quality 82. Raw canvas pixels go straight to sharp (no PNG step). Up to 3 pages are in flight at once (PAGE_CONCURRENCY in utils/pdfConversion.js): each is rendered by the single PDF worker and then uploaded as a private image (resource_type image, type authenticated) to craftflip/users/<userId>/flipbooks/<flipbookId>/pages/<attemptId>/page-NNN. A new attempt ID per conversion keeps a failed attempt's files separate
- Flipbook stores pageCount and ordered pages (pageNumber, publicId, version, format, width, height, bytes) for the viewer. These details are never sent to the client
- On failure: page images from that attempt are deleted by prefix (logged for manual removal if that fails), status becomes failed with a user-facing reason, and the original PDF is kept for retry. All writes are conditional on the attempt ID, so a stale attempt cannot overwrite newer state
- Restart recovery: on startup, flipbooks left in processing are marked failed ("Conversion was interrupted") and their partial images removed. Like the rate limiters, this assumes a single backend instance; several instances would need a shared job queue
- Viewer (Milestone 5): page images stay private and are sent to their owner through the API (see "Private page image delivery"). Making published pages public is decided with publishing
- First measurement: a 3-page generated PDF converted end to end in about 7 seconds (mostly Cloudinary round trips), about 10KB per simple page. A one-page real résumé rendered in about 1 second, about 200KB as WebP
- Performance pass (October 2026), measured locally on the real 20-page brochure (3.4 MB; i5-13500, 20 threads; real Cloudinary and Atlas; the same PDF before and after):
  - Before: original upload to Cloudinary 3.2s; conversion 37.1s = download of the original 3.0s, open 1.3s, render and encode 13.1s, page uploads one at a time 21.0s (about 1s each), save under 1s. Peak process memory 322 MB. Bottleneck: waiting on sequential Cloudinary uploads (57%), then encoding
  - Encoding: within the 13.1s, pdf.js rendering was about 2s; the rest was a PNG encode (4.5s) and decode before the WebP encode. Encoding raw pixels instead produces byte-identical WebP files on all 20 pages, so quality and file sizes are unchanged
  - After: conversion 14.4s, 16.1s and 17.7s over three runs (download 2.8-3.2s, open 1.1-1.3s, pages 9.6-12.4s, save 0.8s); same total image bytes as before (3,489,794); peak memory 380-405 MB. With 5 pages in flight: 12.9s but 481 MB, so 3 was kept until the Railway instance's memory is known
  - Rendering 3 pages at once on one worker gives the same image bytes as rendering them one by one (checked by hash on all 20 pages)
  - Not yet measured: Railway (CPU, memory and network differ), and PDFs over 10 MB (the Cloudinary Free plan cap)
  - End to end in the browser (October 2026, the same 20-page PDF uploaded through the real dashboard; times from clicking Upload, combining browser request timing with server timestamps): before, Ready showed at 22.3s = upload request 3.9s (receive, Cloudinary original upload, slug check, record), separate convert request 0.55s, conversion 16.35s (including a 3s download of the PDF just uploaded), and 1.7s until the next 2-second poll noticed. Each poll takes about 0.55s (token check, user upsert and a read against Atlas), so polls ran every 2.55s. The earlier 14-18s figures were conversion only
  - After starting conversion with the upload (no second request, no download) and polling every 1 second: Ready showed at 19.5s and 18.1s in two runs (upload 4.0-4.1s, conversion 13.3-14.3s from record creation, 1.0-1.5s until the next poll). Polls now run about every 1.55s
  - Remaining time is mostly the Cloudinary upload of the original (about 3.2s for 3.4 MB) and page work (about 11s). Larger PDFs, such as a 6 MB brochure, take longer in the upload and in rendering; they no longer pay for a second download
- Progress for the dashboard: conversion.stage (queued, preparing, converting, finalizing), conversion.totalPages and conversion.completedPages on the flipbook, reset by every new attempt's claim. A page counts as completed only after its image is stored. Writes are conditional on the attempt like every conversion write, are sent one at a time in order, use $max so the count never goes back, and are throttled to about one per second (plus the last page). The owner summary adds conversionProgress { stage, completedPages, totalPages, percent } while processing; percent is the share of stored pages, capped at 99 until the flipbook is Ready. The dashboard polls GET /api/flipbooks/:id every second (each check itself takes about 0.5s) for processing flipbooks, one round at a time, and stops when none is left
- Failure with pages in flight: no new page starts after the first failure, and cleanup waits until every page already in flight has settled, so no upload can land after the attempt's folder is removed

Action still open: convert a real 30-50 page real estate brochure and record conversion time, image quality, Cloudinary storage per flipbook and, in Milestone 5, viewer load speed on mobile. Brochures over 10 MB cannot be uploaded until the Cloudinary plan allows larger files (see "PDF upload and storage").

---

## Flipbook viewer architecture

Decision: one core viewer engine with style configuration layers.

Architecture:
- Core engine: image display, navigation, zoom, fullscreen, touch gestures
- Style layer: transition type, speed, shadow, page curve (per style config object)
- Theme layer: background color, UI control color (per theme config object)

Four styles built on one engine:
1. Luxury Flip: react-pageflip with slow animation and soft shadows
2. Clean Swipe: CSS horizontal slide transition
3. Classic Book: react-pageflip with stronger curve
4. Editorial: CSS fade transition

Build style 1 first and verify it works on mobile before building the others.

Milestone 5 (Luxury Flip, private preview) as built:
- Route /flipbooks/:id (protected), opened from the dashboard's Open action. Lazy-loaded, so the page-flip engine is only downloaded when a flipbook is opened
- react-pageflip 2.0.3 with size "fixed": the page size is computed from the stage size and the stored page dimensions (two-page spread when the stage is at least 640px wide and the spread is not much smaller than a single page, otherwise one page), and the book remounts at the current page when the size changes. Stretch mode was not used because it sizes from the parent's height, which is not fixed here
- Luxury Flip settings: 900ms flip, shadow opacity 0.35, cover and last page shown alone (showCover), page corners on hover
- react-pageflip reads its pages once (renderOnlyPageLengthChange); each page subscribes to an image store, so loading an image does not re-initialise the book. React 19 StrictMode attaches refs twice in development, which would hand react-pageflip each page twice; FlipbookPage passes each element on only once
- Layout rules (spread or single page, page indicator, end of book) live in frontend/src/utils/bookLayout.js and are tested with Node's built-in test runner (npm test in frontend). The frontend has no browser test runner; adding one needs approval
- Not built yet at Milestone 5: zoom, fullscreen, thumbnails, the other three styles (styles: Milestone 7; zoom, fullscreen and thumbnails: "Reader toolbar" below)

Milestone 7 (all four styles) as built:
- One engine: FlipbookReader (components/FlipbookReader.jsx) owns the page-image store and picks a reader by style. PageFlipReader (react-pageflip) runs Luxury Flip and Classic Book with settings from PAGE_FLIP_SETTINGS (utils/viewerStyles.js): Luxury 900ms and shadow 0.35; Classic 1100ms and shadow 0.8, plus a spine shadow and stacked page edges drawn over and under an open spread. SlideReader (CSS) runs Clean Swipe (mode swipe: a horizontal track of single pages, translateX with a 300ms transition, pointer swipe over 40px or a tap on either half) and Editorial (mode fade: the current step fades in with the cf-fade-in keyframes in index.css; spreads via buildViews in utils/bookLayout.js, page numbers under each page, extra white space)
- Shared by all: FlipbookPage (one page image with loading and failed states), ReaderNav (buttons and indicator), useArrowKeys, the same layout maths (fitBook; allowSpread false for Clean Swipe) and the same page order. The CSS styles use the page-flip book's layout (cover alone, then pairs, last page alone when the count is even) and track the first page on screen, so a resize between spread and single pages keeps the place
- Each style mounts fresh when chosen (starting at the cover); the page-image store is shared, so images already loaded stay
- The page-image store (utils/pageImageStore.js, used through hooks/usePageImages.js) does not depend on effect order: a reader may ask for pages (setFocus) before FlipbookReader opens the store, or while StrictMode has closed it, and open() then resumes loading around the last requested page
- Style id stored on the flipbook (viewerStyle, see "Publishing and public sharing" for the public shape). Allowlist in backend/utils/viewerStyles.js and frontend/src/utils/viewerStyles.js; both fall back to luxury-flip for missing or unknown values
- PATCH /api/flipbooks/:id saves the style as { viewerStyle } (400 for an unknown style), filtered by ownerId and status not deleting. Milestone 7 accepted only viewerStyle; Milestones 8 and 9 extended the same route with title, slug (with confirmSlugChange) and reader settings. The full contract is under "Publishing and public sharing", API contract
- Owner preview: ViewerStylePicker (four buttons with drawn previews, role radio) switches the reader immediately, then saves; a failed save restores the previous style and shows the server message. Public viewer: renders flipbook.viewerStyle from the public metadata (no-store, so a change shows on the next load)

## Reader toolbar (October 2026, before Milestone 10)

One toolbar for every viewing style, in the owner preview, the public viewer and embeds. ReaderNav (components/ReaderNav.jsx) became the toolbar, so there is still one navigation system: page overview, previous, the page box, next, zoom out, Fit (shows the zoom level while zoomed), zoom in and fullscreen, on one pill centred below the book.
- Responsibilities: each style keeps its own page model and engine and passes nav { label, firstPage, visiblePages, pageCount, atStart, atEnd, onPrevious, onNext, onGoToPage } to ReaderControls (toolbar plus overview). FlipbookReader owns what is shared across styles (controls): zoom, the overview, the thumbnail store and fullscreen. The rules live in utils/readerControls.js (tested)
- Direct jumps: the page-flip styles call react-pageflip's turnToPage(page - 1), which shows the spread holding that page at once and reports it through the normal onFlip event; the CSS styles set the current page and find the view holding it as before. pagesOnScreen gives the pages on screen for the overview and matches visiblePagesLabel. The page box accepts whole numbers 1..pageCount (parsePageInput); Enter goes there, Escape or leaving the box keeps the page. Arrow keys no longer turn pages while the focus is in any text field (useArrowKeys)
- Zoom: levels 1 (fit), 1.5, 2 and 2.5. The fitted layout is multiplied by the zoom (zoomLayout), never scaled with a CSS transform, so react-pageflip keeps correct pointer positions; its book remounts at the new size on the same page. ZoomViewport scrolls when the book is larger than the stage and re-centres on every zoom step. While zoomed, dragging and swiping pan the view instead of turning pages (react-pageflip useMouseEvents off; the SlideReader swipe and tap handlers off); the toolbar and arrow keys still turn pages
- Fullscreen: the reader stage (background, book, toolbar, button) through the Fullscreen API, with the webkit-prefixed names as a fallback (fullscreenApi). Where the browser has no element fullscreen (iPhone Safari) or the embedding page forbids it (a cross-origin iframe without allowfullscreen; the generated embed code includes it), the button is hidden and the embed bar's Open full screen link remains. The stage has its own background colour so fullscreen never shows the browser's black backdrop
- Page overview (ThumbnailPanel): covers the reader stage with a grid of previews and page numbers (three columns at 390px, more when wider), marks the pages on screen, scrolls to and focuses the current page, closes with Escape or its button, and choosing a page goes there and closes it. createThumbnailStore loads previews only for thumbnails scrolled into view (IntersectionObserver, four at a time, newest first, cancelled when scrolled away before starting); a full page the reader already loaded is reused instead; a failed preview shows "Preview unavailable" and stays clickable. The floating button is hidden while the overview is open
- Previews: the existing page routes take ?size=thumb (utils/pageImageVariant.js; any other size is a 404 before any lookup). The server signs a Cloudinary URL with a fixed transformation (WebP, at most 240px wide, quality auto) of the stored private page, so nothing extra is stored and no address reaches the browser. Measured on the live account: about 14 KB instead of about 206 KB for a brochure page. Public previews have exactly the checks of public pages (published, Ready, page within the book, same rate limit)
- Layout: toolbarMode(stage width) is full from 600px, compact from 340px (one zoom button that becomes Fit while zoomed) and minimal below (no zoom buttons; the browser's pinch zoom still works). Buttons are 36px with a mouse and 44px on touch screens (pointer: coarse). The floating button sits beside the toolbar only on stages at least 980px wide (TOOLBAR_MAX_WIDTH_PX 440); below that it uses the strip under the toolbar (ctaPlacement). The toolbar adds the bottom safe-area inset when no strip is kept

## Reader customisation and embed (Milestone 9)

Data: Flipbook.reader { primaryColor, background { kind, color, preset, image (private: publicId, version, format, width, height, tone, uploadedAt) }, logo (private: publicId, version, format, width, height, uploadedAt), cta { enabled, label, url }, allowDownload }. accentColor (the Milestone 9 top-bar colour) was removed from the schema and API in the follow-up; values on older documents are ignored. Validation in backend/utils/readerSettings.js (parseReaderUpdate, safeWebUrl); views: ownerReaderView (owner summary) and publicReaderView (public metadata, button only when shown, link re-checked). Frontend mirror in frontend/src/utils/readerSettings.js (readerOf fills defaults and reads both API shapes; ctaToShow checks the link again before rendering).

Logo storage (decision): Cloudinary, private (type authenticated), under craftflip/users/<owner>/flipbooks/<flipbook>/branding/logo-<uuid>, served through the API like page images. Chosen over public Cloudinary URLs (permanent, expose internal IDs) and over remote URLs (unvalidated content, tracking, breakage). Upload accepts PNG, JPEG and WebP by magic bytes, never SVG; sharp re-encodes to WebP within 640x240 with a 40-megapixel input limit. A new file name per upload, so replacing never overwrites; the old file is deleted afterwards (failures are logged and the branding folder is removed with the flipbook).

PDF download (decision): the account refuses CDN delivery of PDFs, and signed URLs would be permanent, so the original streams through the backend from Cloudinary's authenticated API download (openOriginalPdfStream in utils/pdfStorage.js), bounded to the 50 MB limit, with Content-Disposition attachment and the slug as file name (the original filename stays private). Public route condition: slug, isPublished true, status ready and reader.allowDownload true in one query. The owner's route (/api/flipbooks/:id/original) checks ownership only.

Embed: the frontend route /embed/:slug renders PublicViewerPage with embed set; same public API and checks, so no separate access path exists. Iframe code generated by embedCode (frontend/src/utils/readerSettings.js) with the title HTML-escaped. Framing rules in frontend/vercel.json: /embed/* frame-ancestors *, everything else X-Frame-Options DENY and frame-ancestors 'none' (protects the dashboard against clickjacking). The API itself is not framed (it returns JSON and images).

Plan gating (later, Milestone 11): proposed pricing restricts the call to action, embed code and removal of CraftFlip branding to paid plans. Not enforced yet; the reader settings and the /embed route are the single places to add a plan check.

Reader background (Milestone 9 follow-up, October 2026): kinds default, color, preset and image (BACKGROUND_KINDS and the BACKGROUND_PRESETS allowlist with each preset's tone in backend/utils/readerSettings.js; the same ids in frontend/src/utils/readerSettings.js). PATCH takes background whole ({ kind, color, preset }) and writes reader.background.kind/color/preset separately, so a stored image survives; the colour and preset are kept while another kind is chosen. backgroundView reads anything incomplete as the default (also after the image is removed, which is why DELETE only clears the image). The public view sends only the background in use.
- Presets are static files in frontend/public/reader-backgrounds (<id>.webp at most 1600px, <id>-thumb.webp 240x160), CC0 from Wikimedia Commons, sources in CREDITS.md there. Temporary placeholders; adding or renaming one needs the file and both allowlists
- Uploaded image: same flow as the logo (readerAssetsController.js builds both from one spec: path, file prefix, size limit, processing, messages). processBackground in utils/logoImage.js: byte check, 8 MB, 40-megapixel input limit, rotate, fit inside 2560x2560, flatten onto white, WebP quality 78, and tone from the mean luminance (dark below 0.5). Stored as branding/background-<uuid> with uploadLogoImage/deleteLogoImage; the upload also sets kind image. Owner: GET/POST/DELETE /api/flipbooks/:id/background (settings rate limit for POST and DELETE). Public: GET /api/public/flipbooks/:slug/background with slug, isPublished, status ready and reader.background.kind image in one query
- Frontend: backgroundAppearance(background, imageSrc) returns { color, image: { url, blurPx, overlay } | null, tone }. The viewer pages paint color on the stage ("relative isolate") only while the book is shown, and ReaderBackground draws the image on its own -z-10 layer: cover-sized, blur(BACKGROUND_IMAGE_TREATMENT.blurPx = 6px), extended 3x the blur beyond the stage and clipped (no soft rim), under a neutral wash (light rgba(250, 250, 249, 0.45), dark rgba(28, 25, 23, 0.3)). The filter never sits on an element containing the pages, navigation or button; the stored and bundled files are unchanged. Solid colours get no layer. The owner preview loads the uploaded image as a blob through useOwnerImage (hooks/useOwnerLogo.js); the public viewer uses publicBackgroundUrl with ?v=revision
- tone: light or dark. ReaderNav draws its controls on a light pill when a background is set; Editorial page numbers turn light on dark backgrounds

Floating call to action (same follow-up): ReaderCta, rendered by FlipbookReader for every style, absolutely positioned at the bottom right of the stage with safe-area-aware offsets. ctaPlacement(stage, hasCta) in utils/bookLayout.js: stages at least 720px wide place it beside the centred navigation (nothing else changes); narrower stages keep a 44px strip below the navigation (ReaderNav navInset) and fit the book into the stage height minus that strip, so the button never overlaps pages or controls. ReaderBar no longer renders the button or a bar colour. ctaToShow, safeWebUrl and rel="noopener noreferrer nofollow" are unchanged.

Customize dialog (same follow-up): three groups, Appearance (logo, background, button colour), Actions (call to action) and Reader settings (downloads, embed). Images save immediately; the form saves the rest through PATCH. The viewing style is chosen only in the preview toolbar: ViewerStylePicker spans the page width and centres its group on the viewport, hides the drawings below 640px and wraps rather than scrolls on the narrowest screens.

## Private page image delivery

Problem: page images are private Cloudinary images (delivery type authenticated). A signed Cloudinary URL sent to the browser would expose the asset's public ID (which contains internal user and flipbook IDs) and would work for anyone holding it, without expiry, so it is not access control.

Decision (Milestone 5): the backend sends page images itself.
- GET /api/flipbooks/:id/pages (requireAuth, filtered by ownerId) returns the summary and pages as { pageNumber, width, height } in order. No Cloudinary details
- GET /api/flipbooks/:id/pages/:pageNumber/image (requireAuth, filtered by ownerId and status ready, one page selected with a $elemMatch projection) builds a signed delivery URL on the server, fetches the image (30 second timeout) and returns the bytes with Content-Type image/webp, Cache-Control private, max-age=3600 and X-Content-Type-Options nosniff. The signed URL is never logged or returned. ?size=thumb returns the 240px WebP preview for the page overview instead (see "Reader toolbar"); any other size is a 404
- An <img> cannot send the Firebase token, so the frontend requests images through the Axios instance as blobs and shows them with object URLs, revoked when the viewer closes
- Per-user rate limit: 1500 page image requests per 15 minutes (in-memory, single instance)
- Cost: page bytes pass through the backend (about 200-260KB per page for the 20-page brochure). Acceptable for the owner's private preview. Public viewing of published flipbooks should use Cloudinary CDN delivery, decided with publishing

---

## Ownership model

Problem: we need to associate flipbooks with users consistently.

Decision: store ownerId in flipbook model as a MongoDB ObjectId reference to the User document.

Flow:
1. Firebase verifies token and returns firebaseUid
2. Middleware looks up User document by firebaseUid
3. User._id (MongoDB ObjectId) is attached to req.user
4. Flipbook model stores ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
5. Every protected operation checks flipbook.ownerId equals req.user._id

This separates Firebase identity (firebaseUid) from the application's internal user identity (MongoDB _id). Queries and ownership checks use MongoDB ObjectId throughout the application.

---

## User identity and account linking

Problem: some identity providers do not return an email address (a Facebook account can be registered with a phone number, or the user can decline the email permission). A unique index on email would reject those users, and multiple users without an email would collide on a missing value.

Decision (Milestone 2):
- firebaseUid is the only identity key: required, unique, indexed
- email is optional and has no unique index; it is stored when the provider returns it and is used for display and notifications only
- On each authenticated request the auth middleware finds the User by firebaseUid, or creates it on first sign-in (an upsert on firebaseUid, so concurrent first requests cannot create two documents)
- Users are never looked up, matched, or merged by email
- email, displayName and photoURL are refreshed from the verified token claims on each authenticated request; claims the token does not carry are left unchanged. When users can edit their profile in the app, this sync must be revisited so it does not overwrite their edits
- If Firebase Admin is not configured, protected routes return 503 ("Authentication is temporarily unavailable.") rather than 401, so a server misconfiguration is not reported to the user as a bad session

Account linking: not built in V1. Firebase's default "One account per email address" project setting stays enabled, so Firebase itself refuses to create a second account with an email that already exists under a different sign-in method (error auth/account-exists-with-different-credential). The frontend shows a toast telling the user to sign in with the method they used originally. Linking providers to one account is a future decision and must be recorded here before it is built.

---

## Authentication rate limiting

Requirement: PROJECT.md requires rate limiting on auth endpoints, and it is an acceptance criterion for Milestone 2.

Decision: express-rate-limit (approved by the owner for Milestone 2), in backend/middleware/rateLimiter.js, mounted on the /api/auth router.

Approach:
- Apply a per-IP rate limiter to all /api/auth/* routes
- Requests over the limit get HTTP 429 with { "success": false, "message": "Too many requests. Please try again later." }
- Proposed starting limit: 100 requests per IP per 15-minute window, tuned once real traffic is known
- Railway runs the app behind a proxy, so Express must trust exactly one proxy hop (app.set('trust proxy', 1)) for the limiter to see the real client IP. Never trust all proxies, which would let clients spoof their IP
- To verify on first Railway deploy: confirm req.ip is the real client IP (not a Railway proxy address). If Railway adds more than one hop, the trusted hop count must change
- Local development has no proxy, so a client can set X-Forwarded-For and change the IP the limiter sees. This is harmless locally; it is only safe in production because Railway's proxy appends the real client IP
- In-memory counters are acceptable while the backend runs as a single Railway instance; a shared store is needed only if it scales to several instances
- Password guessing for email/password sign-in happens against Firebase, not our backend; Firebase Authentication applies its own abuse protection there. Our limiter protects our own API endpoints

Rate limit headers follow the IETF draft-8 RateLimit / RateLimit-Policy format; the legacy X-RateLimit-* headers are disabled.

---

## PDF upload and storage (Milestone 3)

Decision: the original PDF is uploaded through the backend and stored in Cloudinary as a private asset.

- Endpoint: POST /api/flipbooks (multipart/form-data, one file in the "pdf" field), behind requireAuth
- Multer memory storage: the file is held in memory and never written to the server's disk. 50MB limit in Multer, checked again in the controller
- File type: the file's first bytes must be a PDF header (%PDF-1.x or %PDF-2.x). The filename and the MIME type sent by the browser are not trusted
- Storage: resource_type raw, delivery type authenticated, so the original PDF has no public URL (a public /upload/ URL returns 404 and an unsigned authenticated URL returns 401). Cloudinary URLs and asset details are never sent to the client. On the current account even signed delivery URLs return 401 ("deny or ACL failure", Cloudinary's account-level PDF delivery restriction). The backend reads an original back through the authenticated API download (private_download_url), which is unaffected
- Cloudinary plan cap: the Free plan limits each file to 10 MB (raw and image), below the 50MB product limit. Cloudinary rejects larger files with a 400 "File size too large", which the controller returns as a structured 413. Accepting PDFs up to 50MB requires a Cloudinary plan whose per-file limit is at least 50MB; check the plan's limits before launch
- Cloudinary public ID: craftflip/users/<userId>/flipbooks/<flipbookId>/original.pdf, using MongoDB ObjectIds. Converted page images (Milestone 4) go under the same flipbook folder (see "PDF processing pipeline")
- Order of operations: the flipbook ID is generated first, the PDF is uploaded to Cloudinary, then the Flipbook document is created. If the Cloudinary upload fails, nothing is written to MongoDB. If the MongoDB write fails, the uploaded asset is deleted; if that delete also fails, the public ID is logged for manual removal
- Rate limit: 20 upload requests per user per hour (express-rate-limit, keyed by the MongoDB user ID, in-memory store), returning a structured 429. Every upload request counts, including rejected ones
- Missing Cloudinary credentials: the server still starts and uploads return a structured 503
- Ownership: list and read queries always filter by ownerId. A flipbook owned by someone else returns the same 404 as a missing one
- Free plan limit (3 live flipbooks) is not enforced at upload; it is enforced at publish since Milestone 6 (see "Publishing and public sharing")

---

## Flipbook deletion (Milestone 8, first part)

Problem: a flipbook owns files in two places (MongoDB and Cloudinary). Deleting the record first would orphan files with no record pointing at them; deleting files first and then failing would leave a record whose files are gone. A conversion running at the same time could add page images after the cleanup.

Decision: a "deleting" status and files-before-record order.
- DELETE /api/flipbooks/:id (requireAuth, per-user rate limit 60/hour) claims the flipbook with findOneAndUpdate filtered by _id, ownerId and status in uploaded, ready, failed or deleting, setting status deleting and isPublished false (Milestone 6: public access stops before any file is touched; the slug stays retired). A missing or foreign flipbook gets 404; a processing one gets 409
- Why not delete while processing: runConversion uploads page images only while the record is processing, and every write it makes is conditional on status processing and its attempt ID. Refusing deletion during processing, and refusing conversion of a deleting record, means no new page image can appear after deletion starts. Cancelling a running conversion was not built: the render worker and its Cloudinary uploads would need a cancellation path
- deleteFlipbookAssets (utils/pdfStorage.js): refuses unless the stored PDF public ID is exactly <flipbook folder>/original.pdf, deletes it (raw, authenticated; "not found" is fine), then deletes images by the prefix <flipbook folder>/pages/ (image, authenticated), covering every conversion attempt. Any result other than deleted or not_found, an API error, or more than 50 batches throws
- Only after cleanup succeeds is the record removed (deleteOne filtered by owner and status deleting). If cleanup throws, the record stays as deleting and the API returns 502; deleting again repeats the idempotent cleanup. Two concurrent deletions both run the same idempotent cleanup; one removes the record
- The record keeps no copy of its previous status, so a failed deletion cannot be undone; the dashboard shows it as "Not fully deleted" with the Delete button to retry, and the viewer treats it as not found
- Verified live with throwaway files (see PROJECT.md). Cloudinary can keep empty folders after their files are deleted; they are harmless

## Publishing and public sharing (Milestone 6)

Status: implemented; owner checks pending (PROJECT.md). This section is the contract.

### Facts it builds on (verified October 2026)

- Cloudinary account: Free plan, 25 monthly credits. Page images are type authenticated. Signed delivery URLs contain the full public ID (owner and flipbook ObjectIds) and never expire (the same URL is generated again later), so they are never given to visitors
- Conversion claims only uploaded or failed flipbooks, so a ready flipbook is never converted again; deletion claims anything but processing
- Express trusts one proxy hop; the rate limiters and the publish lease assume nothing about instance count except where noted

### Publication state

Fields on Flipbook (status is unchanged and still the conversion and deletion lifecycle):
- isPublished: Boolean, default false
- publishedAt: Date or null (latest publish)
- firstPublishedAt: Date or null (set once; marks the slug as permanently public)
- unpublishedAt: Date or null
- Index { ownerId: 1, isPublished: 1 } for the plan count. Existing documents need no migration

A flipbook is public only while status is ready and isPublished is true. Every public query filters on slug, isPublished true and status ready, so deleting, unconverted and unpublished flipbooks are equally invisible.

Transitions:
- ready, unpublished -> published: owner publishes (plan slot required)
- published -> unpublished: owner unpublishes (allowed in any status; only clears the flag)
- unpublished -> published again: same slug and URL
- uploaded, processing, failed: publish refused (409). After a successful retry the flipbook can be published
- any -> deleting: the deletion claim sets status deleting and isPublished false in one update

The owner summary (toSummary) adds isPublished (true only while ready) and publishedAt.

### Concurrency

- Publish runs under a per-user lease on the User document (publishLock { token, expiresAt }): acquired with one conditional findOneAndUpdate (free or expired), held for at most 15 seconds, released by token. Requests wait up to 10 seconds for it, then get 409 "Another publish request is still running". Inside it: read the flipbook, check state, count published flipbooks, reserve the slug, publish with a conditional update (status ready, same slug, and firstPublishedAt null on a first publish). So simultaneous publishes cannot exceed the limit and the same flipbook is published once
- Why a lease and not a counter or a transaction: a counter on the user can drift if a request dies between two writes; a transaction that only counts and then updates a different document still lets two requests both see a free slot (write skew). The lease is one field on an existing document, works across instances, and recovers on its own. Measured against Atlas: five simultaneous publishes from one user all completed within the wait (3 published, 2 refused with the plan message)
- Unpublish and the deletion claim do not take the lease: they only free slots, and the publish update's filter (status ready) fails if a deletion claimed the flipbook first
- Publish versus conversion cannot overlap: publish needs ready, conversion needs uploaded or failed

### Slugs and retirement

- URL: /view/[slug] with the existing slug (lowercase letters, digits and hyphens, title-based with a 4-character random suffix, no internal IDs). Public endpoints refuse anything not matching ^[a-z0-9]+(-[a-z0-9]+)*$ or longer than 80 characters before touching the database
- PublishedSlug collection { slug (unique), flipbookId, createdAt }: every slug that has been published. Never deleted for a published flipbook, including when the flipbook is deleted
- At publish, under the lease: upsert { slug } with $setOnInsert flipbookId. If the record belongs to this flipbook, publish under it. If it belongs to another (deleted) flipbook and this flipbook was never published, the flipbook gets a fresh slug (allowed before first publish by the Slug rules) and the reservation is retried; a duplicate-key race between two upserts is retried too
- If the publish update then fails (for example a deletion claimed the flipbook) and it was the first publish, the reservation is removed again. This is safe because no other publish for that user can run while the lease is held
- Uploads skip slugs found in the registry. A rare race there is caught at publish by the step above
- Republishing keeps the slug; the registry holds exactly one record per slug
- Left behind only if the server dies between reserving and publishing: a reservation for a slug that never went public (harmless, it is just never reused)

### Public page images

Options considered: (A) the backend serves images after a publication check (chosen); (B) signed Cloudinary URLs (rejected: permanent and expose internal IDs, verified); (C) short-lived token URLs (paid Cloudinary feature, not available on the Free plan per Cloudinary's documentation, not verified on this account); (D) public copies on publish (CDN speed but slow revocation, doubled storage; a later scaling step).

How A works:
- GET /api/public/flipbooks/:slug/pages/:pageNumber finds the flipbook by slug with isPublished true and status ready, selecting only pageCount and the one requested page ($elemMatch). The page number must be a positive integer within pageCount
- The image is fetched from Cloudinary with a signed URL built on the server from that record (openPageImageStream in utils/pdfStorage.js) and piped to the visitor as a stream. Nothing from the request is used to build the URL, so the endpoint cannot be used to fetch other addresses. Responses claiming more than 20 MB are refused
- Cloudinary failure: 502 "We couldn't load this page. Please try again."; Cloudinary not configured: 503

### Caching and stale links

- Public metadata and every public error: Cache-Control no-store (set for the whole /api/public router)
- Page images: Cache-Control private, max-age=300. private forbids shared caches and CDNs from storing them; the visitor's browser may reuse a page for up to 5 minutes. No conflicting directives. Railway serves the API directly with no caching proxy in front; if a CDN is ever added, it must honour private
- After unpublishing or a deletion claim, the next metadata or image request returns 404. What a visitor already has cannot be taken back: pages on screen, pages in their browser cache for up to 5 minutes, downloads and screenshots. A stale open tab keeps showing pages it already loaded and shows a "couldn't load" placeholder for pages it had not loaded
- The API process keeps no copy of publication state; every request reads MongoDB through the unique slug index

### API contract

Owner (behind requireAuth, ownerId in every filter, 60 requests per user per hour):
- POST /api/flipbooks/:id/publish -> 200 { "success": true, "data": { "flipbook": { ...summary, "isPublished": true, "publishedAt": "2026-10-15T10:00:00.000Z", "slug": "et-listing-presentation-final-5-x7k2" } } }. 404 "Flipbook not found." (missing, another user's, invalid ID). 409 "Only converted flipbooks can be published.", "This flipbook is being deleted.", "Another publish request is still running. Please try again.", "This flipbook changed while it was being published. Please try again.". 403 "Your Free plan allows 3 published flipbooks at a time. Unpublish or delete one to publish this flipbook." 429
- POST /api/flipbooks/:id/unpublish -> 200 with the summary (also when already unpublished). 404. 429
- PATCH /api/flipbooks/:id (Milestone 7, extended in 8 and 9): body with any of title, slug (with confirmSlugChange: true after the first publish), viewerStyle and reader { primaryColor, background, cta, allowDownload }, and nothing else -> 200 with the summary. 400 for any other field or an invalid value; 404 missing or not the owner's; 409 while deleting, for a link that is taken or retired, or { "success": false, "message": "...", "requiresConfirmation": true } for an unconfirmed change of a published-before link; 429 (120 per user per hour). The slug is written first, so a refused request writes nothing. The summary includes hasBeenPublished
- GET /api/flipbooks now also returns data.publishing { "published": 2, "limit": 3 } (limit null when unlimited)

Public (/api/public router, no requireAuth, Authorization headers ignored, X-Robots-Tag noindex, nofollow and X-Content-Type-Options nosniff on every response):
- GET /api/public/flipbooks/:slug (300 per IP per 15 minutes)
  200 { "success": true, "data": { "flipbook": { "slug": "et-listing-presentation-final-5-x7k2", "title": "ET Listing Presentation - Final 5", "viewerStyle": "luxury-flip", "pageCount": 20, "pages": [ { "pageNumber": 1, "width": 1600, "height": 2071 } ] } } }
  404 { "success": false, "message": "Flipbook not found." } for every unavailable case
  Since Milestone 9 also "reader": { "primaryColor": "#1f4e79", "background": { "kind": "preset", "preset": "warm-wood", "tone": "light" }, "logo": { "width": 320, "height": 80, "revision": 1792090076881 }, "cta": { "label": "Book a viewing", "url": "https://agency.example/book" }, "allowDownload": true } (logo and cta null when not set or not shown; background is { "kind": "default" }, { "kind": "color", "color" }, { "kind": "preset", "preset", "tone" } or { "kind": "image", "revision", "tone" })
- GET /api/public/flipbooks/:slug/logo (Milestone 9, 300 per IP per 15 minutes) -> image/webp, Cache-Control private, max-age=300; 404 when unpublished or no logo
- GET /api/public/flipbooks/:slug/background (Milestone 9 follow-up, 300 per IP per 15 minutes) -> image/webp, Cache-Control private, max-age=300; 404 unless published, Ready and the uploaded image is the chosen background
- GET /api/public/flipbooks/:slug/download (Milestone 9, 20 per IP per 15 minutes) -> application/pdf attachment, no-store; 404 unless published, Ready and downloads allowed
- GET /api/public/flipbooks/:slug/pages/:pageNumber (3000 per IP per 15 minutes) -> image/webp stream (with ?size=thumb: the 240px WebP preview for the page overview; any other size is a 404); 404 { "success": false, "message": "Page not found." }; 502; 503; 429
- Never returned publicly: ownerId, owner email or name, firebaseUid, _id, originalFilename, sizeBytes, status, conversion details, publicId, version, attempt IDs, URLs

### Frontend

- /view/:slug (PublicViewerPage) and the signed-in app (AuthenticatedApp: AuthProvider and every other route) are separate lazy chunks, so the public viewer never loads Firebase or starts an auth session. It calls the API through utils/publicApi.js (no token interceptor) and renders the shared FlipbookReader, which gets page images through a loadPage function and has no API or auth code
- Dashboard (FlipbookList): Publish, Unpublish, Copy link (navigator.clipboard, falling back to a toast with a selectable link), a published summary against the plan limit. Rows update from the server's response

### Search engines

- Public API responses carry X-Robots-Tag: noindex, nofollow
- The /view page renders <meta name="robots" content="noindex, nofollow"> (React 19 hoists it into head). Crawlers that run JavaScript see it; others only see the SPA's index.html
- frontend/vercel.json sends X-Robots-Tag: noindex, nofollow for /view/* and rewrites all paths to index.html (needed for /view/*, /dashboard and /flipbooks/* deep links). Not testable locally; check after deployment. robots.txt deliberately does not block /view/, since a blocked page's noindex is never read
- noindex is not access control

### Future extensions (not built)

- OG previews (Milestone 13): crawlers do not run JavaScript, so /view/* needs server-rendered meta tags (a Vercel function or a backend HTML route) using the public metadata endpoint, plus an OG image stored as its own public asset
- Curated reader backgrounds, the final look and dismissibility of the floating CTA: UI/UX pass (PROJECT.md, "Product Decisions for the Future UI/UX Pass")
- Analytics (Milestone 10): built differently from this note; views come from the viewer's activity reports, not from metadata requests (see "Analytics (Milestone 10)")
- Paid plans (Milestone 11): limits already come from planLimits.js and the plan stored in MongoDB
- Faster delivery at scale: option D or token URLs, without changing the public URL

Built since this list was written (Milestone 9, see "Reader customisation and embed"): reader branding (logo, colours), call-to-action settings, the PDF download control (public reader fields and /api/public/flipbooks/:slug/download), and website embedding through /embed/:slug (not /view?embed=1; only /embed/* may be framed). The Milestone 9 follow-up added the reader background (presets, colour, uploaded image) and moved the CTA to a floating button.

---

## Slug system

Problem: multiple users could create flipbooks with identical titles.

Decision: auto-generate slug from title, append 4-character random alphanumeric ID.

Generation:
1. Take flipbook title input
2. Convert to lowercase
3. Replace spaces and special characters with hyphens
4. Remove consecutive hyphens
5. Append hyphen and 4-character random alphanumeric ID
6. Check uniqueness in database (retry with new random ID on collision)

Editability rules:
- Before first publish: editable without warning
- After first publish: editable, but API returns a warning flag that old link will break
- Title changes never automatically update slug after first publish
- A slug that was ever published is retired permanently (PublishedSlug registry) and never given to another flipbook, even after deletion. Before its first publish a flipbook may receive a new slug if its slug is found retired (Milestone 6)
- Owner slug editing (Milestone 8), through PATCH /api/flipbooks/:id { slug, confirmSlugChange }: input trimmed and lowercased, then 3-80 characters of a-z, 0-9 and single hyphens (normalizeSlugInput in utils/slug.js; the public routes use the same pattern). changeSlug in utils/publishing.js runs under the per-user publish lease: owner and not deleting; no change if equal; if firstPublishedAt is set and confirmSlugChange is not true, 409 with requiresConfirmation; refused (409 "That link is not available") if the registry holds the slug for another flipbook or another live flipbook has it (unique index); if the flipbook is published, the new slug is reserved before the update so it is never public unreserved; the update is conditional on the old slug and status not deleting. Old published slugs stay reserved for the same flipbook, which may return to them. No redirects or aliases: an old link shows the not-found page

---

## File access control

Two explicit tiers:

Published content: page images for published flipbooks are intentionally public: anyone with the viewer link can load them. Since Milestone 6 they are served by the backend after a publication check on every request, not through Cloudinary URLs (see "Publishing and public sharing").

Private content: original PDF files and unpublished assets are not exposed publicly. Access controlled through backend.

Important clarifications:
- A hard-to-guess URL is not access control
- A browser displaying a Cloudinary image reveals its delivery URL in browser dev tools
- The original PDF is never directly accessible to viewers
- Unpublished flipbooks are not accessible via the viewer URL

---

## MongoDB indexes to create

Users collection:
- firebaseUid: unique (required)
- email: no unique index (optional field; see "User identity and account linking")

Flipbooks collection:
- slug: unique
- ownerId: index (for querying user's flipbooks)
- createdAt: index (for sorting)

Flipbooks collection, also:
- compound (ownerId, isPublished): index (plan limit count, Milestone 6)

PublishedSlug collection:
- slug: unique (permanent slug retirement, Milestone 6)

Analytics collection (viewsessions, Milestone 10):
- compound (ownerId, startedAt): account reports by period
- compound (flipbookId, startedAt): one flipbook's reports by period
- compound (flipbookId, visitorId, lastSeenAt): finding the visitor's open session for each report

---

## Firebase Admin credentials on backend

Local development: use firebase-service-account.json in backend folder, loaded in config initialization. This file is in .gitignore and must never be committed.

Production on Railway: store the JSON content as environment variable FIREBASE_SERVICE_ACCOUNT_JSON. Parse it in the Firebase Admin initialization:
```js
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
```

---

## Analytics (Milestone 10)

Own MongoDB collection (viewsessions, model ViewSession), no third-party service or script.

Definitions:
- View: one reading session of a published flipbook. A report from the same visitor for the same flipbook within 30 minutes of their last activity (VIEW_SESSION_GAP_MS) continues it, so reloads, re-renders, React StrictMode's double mount and returning to the tab do not add views; a report after a longer pause starts a new view
- Unique visitor: one random visitor ID (crypto.randomUUID, localStorage key craftflip.visitorId, created on the first public visit) with at least one view in the period. It identifies a browser, not a person; it is never derived from the IP address or the device and never returned to owners. Daily unique visitors are counted per day
- Page view: the number of views in which a page was on screen for at least a second (PAGE_DWELL_MS); pages flipped past faster are not counted, and a page counts once per view. Pages per view averages the distinct pages seen per view
- Not reported: time spent (lastSeenAt is only the last report), countries (not collected; see "Visitor country" below)

Recording (public, no sign-in): POST /api/public/flipbooks/:slug/activity with a text/plain JSON body { visitorId, pages, referrer, embedded } (text/plain so browsers send it without a CORS preflight and with keepalive while the page closes; application/json is accepted too). 4 KB limit (413), 600 per IP per 15 minutes (publicActivityRateLimiter). The flipbook must match the public filter (slug, isPublished, status ready) or the answer is the usual 404 and nothing is stored. parseActivity accepts exactly those fields: a UUID, up to 50 whole page numbers within the book, an optional referrer (reduced to its host, "www." removed; path and query dropped) and a boolean. User agents matching crawlers, previews, headless tools and HTTP libraries, or missing, are ignored (204 without a write). The write is one atomic findOneAndUpdate with upsert (sessionUpsert): find the visitor's session with lastSeenAt in the last 30 minutes, add the pages ($addToSet) and set lastSeenAt; otherwise insert a new one with ownerId copied from the stored flipbook, startedAt, deviceType (mobile, tablet or desktop from the user agent, which is not stored), referrerHost and embedded. Answers are 204 with no body; a database failure is logged and still answered 204. The IP address is used only in memory by the rate limiter.

Viewer side (frontend/src/utils/viewTracking.js, hooks/useViewTracking.js, used only by PublicViewerPage, so the owner preview never reports): after the flipbook loads, one report for the visit; ReaderControls passes the pages on screen after every move (not while the page overview covers them); pages shown for a second are batched and sent at most every 10 seconds (REPORT_INTERVAL_MS) and when the page is hidden or closed (fetch keepalive). Reports never overlap; a 4xx answer stops reporting for that page load, a network or 5xx failure keeps the pages for the next report. Nothing is sent when navigator.globalPrivacyControl is true or Do Not Track is 1, or when the slug is in craftflip.ownedFlipbooks (written by the dashboard list and the owner preview, so the owner's own browser is not counted; not access control). Requests use fetch rather than the Axios instance because they need keepalive and text/plain.

Reports (behind requireAuth, analyticsRateLimiter 300 per user per 15 minutes):
- GET /api/analytics?range=7d|30d|90d|all&tz=<IANA zone> -> { range, timeZone, from, to, totals { views, uniqueVisitors, averagePagesPerView }, series { bucket: day|month, points [{ date, views, uniqueVisitors }] }, devices { desktop, mobile, tablet }, sources [{ host, embedded, views }] (top 8), flipbooks [{ id, title, slug, isPublished, views, uniqueVisitors, averagePagesPerView, lastViewedAt }] } (every flipbook of the account except ones being deleted, at zero when unviewed, most viewed first, at most 200). 400 for another range or an invalid zone
- GET /api/analytics/flipbooks/:id with the same parameters -> the same figures for one flipbook plus flipbook { id, title, slug, isPublished, pageCount } and pages [{ pageNumber, views }]; 404 for an invalid ID, another owner's flipbook or one being deleted
- Every query matches ownerId: req.user._id first (and flipbookId for one flipbook). One aggregation with $facet per report; unique visitors are counted by grouping on visitorId and then counting groups, so no visitor list is built or returned. Days and months are bucketed with $dateToString in the owner's time zone (MongoDB 8). Periods: the last 7, 30 or 90 calendar days including today, from local midnight (zonedStartOfDay handles daylight-saving changes); all time has no lower bound and groups by month from the first month with views. Missing days and months are filled with zeros (fillSeries)

Lifecycle: unpublishing or deleting stops new reports at once (public filter). Deleting a flipbook removes its sessions after the record (a failure is logged and does not fail the deletion). Sessions of unpublished flipbooks stay in the reports.

### Visitor country (decided October 2026, deferred)

Rule: the country may come only from a country-code header set by hosting or proxy infrastructure that overwrites any client copy, documented by the provider. Never from a header a client can send, never from a stored IP address, and not from a GeoIP package, geolocation API or new paid service without the owner's approval.

Checked on 17 October 2026, no such source exists in the current or planned deployment:
- Reports go from the visitor's browser straight to the Railway API (frontend/src/utils/viewTracking.js posts to VITE_API_BASE_URL). frontend/vercel.json rewrites only to index.html; no API request passes through Vercel
- Railway's documented edge request headers (docs.railway.com, Public Networking, Specs and Limits) are X-Real-IP, X-Forwarded-Proto, X-Forwarded-Host, X-Railway-Edge, X-Request-Start and X-Railway-Request-Id. X-Railway-Edge names the Railway edge location that received the request, not the visitor's country. A request for an x-railway-ip-country header (Railway feedback board, March 2026) is under review, not shipped
- Vercel's x-vercel-ip-country is documented as a header sent to Vercel deployments (functions). Vercel does not document passing it to an external rewrite destination, and the Railway domain is public, so a country header arriving there could have been set by anyone

So ViewSession.country stays null (sessionUpsert), nothing reads a country header, and the tests check that X-Vercel-IP-Country, CF-IPCountry, CloudFront-Viewer-Country, X-Country-Code and X-Railway-Edge sent by a client change nothing, and that a country field in the report body is refused (400).

To enable it later (each needs the owner's approval; none is built):
1. Railway ships a documented country header that its edge overwrites. Read only that header, accept /^[A-Z]{2}$/ only, treat XX, T1 and anything else as null, store it in $setOnInsert. Simplest option, no new parts
2. Send activity reports through a Vercel Function on the frontend domain that reads x-vercel-ip-country and forwards the report to Railway with a shared secret header (a new backend variable, not in the current list); the backend accepts the country only when the secret matches (constant-time compare) and otherwise stores null. Needs a Vercel function, a new secret, the IP-based rate limit adapted (Railway would then see Vercel's address), and a deployed check that the header arrives
3. A proxy such as Cloudflare in front of Railway, using its country header, with the origin locked so only the proxy can reach it. A new service and a DNS change
With any of them: show countries on the dashboard only once data exists, and add tests for valid, missing, invalid and untrusted values.

Dashboard (frontend/src/components/analytics): AnalyticsSection (periods, cards, ViewsChart, devices and sources, the flipbook list with FlipbookAnalyticsDetail per flipbook), helpers in utils/analyticsReport.js. The chart is plain SVG (no chart library): one series in --cf-chart-series (#2a78d6 light, #3987e5 dark, both checked with the dataviz palette validator against the card surfaces), columns at most 24px with a 4px rounded top, hairline grid, a tooltip per column on hover, tap or arrow keys, and a table view.

## Transactional email (Milestone 12)

Status: implemented; real delivery waits for the Resend account (PROJECT.md, Milestone 12).

Parts:
- config/resend.js: reads RESEND_API_KEY once, lazily (after dotenv), and accepts only values shaped like a Resend key (re_...). Missing or malformed: getResendSettings() returns null and "Resend not configured" is logged; the key itself is never logged. EMAIL_FROM (CraftFlip <hello@flip.thecraftaxis.com>) is a constant here, not a variable: it is not a secret, and the variable list in AGENTS.md is fixed. Its domain must be verified in Resend
- utils/email.js, sendEmail({ to, subject, html, text, template, idempotencyKey }): validates (one address, no line breaks in the subject, both bodies present, template usable as a Resend tag, key at most 256 characters), then POST https://api.resend.com/emails with Authorization Bearer, the Idempotency-Key header when given and a 10-second timeout. Always resolves: { status: 'sent', id }, { status: 'skipped', reason: 'not_configured' } or { status: 'failed', reason, retryable } (429, 5xx, network errors and timeouts are retryable; other 4xx are not). Logs only the template, outcome, HTTP status, Resend's error name and the message ID
- Why fetch and not the resend package: one POST is all that is needed, Node 22 has fetch, and the task added no dependency. Switching to the SDK later only changes sendEmail
- utils/emailTemplates.js: renderLayout plus welcomeEmail, upgradeConfirmationEmail and paymentFailedEmail, each returning { subject, html, text }. Tables and inline styles (what email clients render); every value escaped; links checked (absolute http or https, no credentials); plans limited to starter and pro. EMAIL_THEME holds the placeholder colours and fonts in one place

Welcome email (utils/welcomeEmail.js):
- User.welcomeEmail { status: null | pending | sending | sent | skipped | failed, attempts, nextAttemptAt, sentAt }. requireAuth's upsert sets status pending in $setOnInsert, so only accounts it creates are eligible; accounts created before Milestone 12 read as null and are never sent one (no migration, no surprise emails to existing users)
- After the user is loaded, requireAuth calls scheduleWelcomeEmail(req.user) without awaiting it and then next(). It returns at once unless the status is pending or sending, so normal requests do no extra database work
- Claim: one findOneAndUpdate on _id with status pending or sending and nextAttemptAt null or due, setting status sending and nextAttemptAt now + 15 minutes (a lease). Only one request wins, so repeat and simultaneous sign-ins send once. Every later write is conditional on status sending
- Outcomes: sent (sentAt); skipped when there is no email address or Resend is not configured; retryable failures go back to pending with the lease as the wait, at most 3 attempts; other failures, an invalid CLIENT_URL and the third retryable failure end as failed. A server stopping mid-send leaves sending, claimable again after the lease; the Idempotency-Key welcome-email/<userId> lets Resend drop the duplicate within its 24-hour key window
- The dashboard link is CLIENT_URL + /dashboard. The welcome email is sent to the address in the verified Firebase token, verified or not (the app has no email verification step)
- No queue: retries happen only on the user's next authenticated request. A queue or scheduled retry is a later decision if delivery problems are seen

Prepared for Milestone 11 (not connected): upgradeConfirmationEmail({ displayName, plan, dashboardUrl }) and paymentFailedEmail({ displayName, plan, billingUrl }). Milestone 11 should send them only from the verified Paddle webhook handler, after the plan change is stored, with sendEmail and an idempotency key derived from the Paddle event ID, so a redelivered webhook does not send twice. No price, renewal date or grace period is in the templates.

Tests mock fetch (tests/email.test.js) or the email module (tests/welcomeEmail.test.js); no test needs a Resend account or the network.

## Decisions still pending

- Country in analytics: decided (trusted infrastructure header only) but deferred, because the deployment has no such header; the options to enable it are in "Analytics", "Visitor country". ViewSession.country is reserved for it

- Exact Paddle plan product IDs (after account approval)
- Final CraftFlip brand colors and typography
- Loading animation design (placeholder in V1, refined later)
- Email template designs for Resend: a first branded layout exists (Milestone 12); its final look follows the brand colours and the UI/UX pass
- Email sender address: CraftFlip <hello@flip.thecraftaxis.com> chosen in Milestone 12, to be confirmed by the owner when the domain is verified in Resend (change EMAIL_FROM in backend/config/resend.js), and whether replies need a mailbox or a reply-to address
- Measurement of PDF conversion performance with realistic brochure files
- Viewer load speed on a real phone (Milestone 5 owner check)
- When traffic grows: moving public page images to CDN delivery (public copies or token URLs; see "Publishing and public sharing", options C and D)
- Removing empty Cloudinary folders after deletion (optional)
- Cloudinary plan: the Free plan's 10 MB per-file cap is below the 50MB product limit
- Account linking across sign-in methods (not in V1; see "User identity and account linking")
- UI/UX pass details: final curated background collection, floating CTA appearance, spacing, mobile behaviour and dismissibility (see PROJECT.md, "Product Decisions for the Future UI/UX Pass")
