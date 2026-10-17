# CraftFlip — Project Master Reference

> This is the single source of truth for the CraftFlip project.
> All coding agents (Claude Code, Codex) must read this file before starting any session.
> Do not deviate from decisions marked CONFIRMED without explicit approval from the project owner.

---

## What is CraftFlip?

CraftFlip is a premium subscription-based flipbook platform built by The CraftAxis agency (thecraftaxis.com). Clients upload a PDF (brochure, real estate guide, company profile, catalog, buyer/seller guide) and get a beautiful, shareable, interactive flipbook with a hosted public link.

Live URL: flip.thecraftaxis.com
Product name: CraftFlip
Owner: Asif, CEO of The CraftAxis, Dhaka, Bangladesh
Status: Milestones 1 and 3 complete. Milestone 2 (Firebase Authentication) committed; email/password check pending. Milestone 4 (PDF conversion) implemented, two owner checks pending. Milestone 5 (first flipbook viewer) implemented, awaiting the owner's phone and page-order checks. Milestone 6 (publishing and public sharing) implemented, awaiting the owner's checks. Milestone 7 (four flip styles and the style picker) implemented, awaiting the owner's checks. Milestone 8 (dashboard and flipbook management, including secure deletion) implemented, awaiting the owner's checks. Milestone 9 (branding, call to action, reader settings, embed) implemented, awaiting the owner's checks; its follow-up (reader background, floating call to action, regrouped Customize dialog) implemented October 2026, awaiting the owner's checks. Milestone 8, first part (secure flipbook deletion) implemented, awaiting the owner's browser check. Milestone 10 (analytics) implemented, awaiting the owner's checks; visitor country deferred (no trusted country source in the current deployment, see Milestone 10). Milestone 11 (Paddle billing) postponed by the owner (Paddle account setup blocked). Milestone 12 (transactional email via Resend) implemented, awaiting Resend account setup and the owner's delivery check. Started October 2026.

---

## Who is this for?

Primary audience at launch:
- Existing CraftAxis brochure and design clients
- Real estate agents and brokerages (US, UAE, UK, Europe, Saudi Arabia)
- Property developers and marketing agencies
- Small businesses sharing company profiles and catalogs

Secondary audience (growth phase):
- International users acquired through Meta ads and content marketing

---

## Core product philosophy

- Premium feel over feature quantity
- Mobile-first, always
- Simple enough for non-technical clients
- Fast loading, even on slow connections
- Luxury design aesthetic, not generic SaaS
- Every feature must serve the client's business goal (more leads, better presentation)

---

## Current milestone

**Milestone 12: Transactional email via Resend**

Status: Implemented, not yet complete: real delivery needs a Resend account, a verified sender domain and the API key (the unchecked criteria). Built before Milestone 11 at the owner's request, because Paddle account setup is blocked (October 2026); Milestone 11 is postponed, not dropped, and the numbering is unchanged. Details in REFERENCE.md, "Transactional email (Milestone 12)".

Goal: CraftFlip can send branded transactional emails from the server. New accounts get one welcome email. Templates for the upgrade confirmation and the payment failure notice are ready for Milestone 11 but not connected to anything.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] Server-side email service (backend/utils/email.js) calling the Resend REST API with Node's built-in fetch: no new package, no queue. The key is read only from RESEND_API_KEY on the backend (config/resend.js); nothing email-related reaches the frontend. sendEmail never throws: it returns sent, skipped or failed (with whether a retry can help), has a 10-second timeout, and refuses invalid recipients, subjects with line breaks, empty bodies and malformed tags before any request
- [x] Missing configuration: without RESEND_API_KEY (or with a value that is not a Resend key) the server starts normally, logs "Resend not configured", and every email is skipped and logged. Nothing else changes
- [x] Logging: the template name, the outcome, Resend's HTTP status and error name, and the Resend message ID. Never the API key, the recipient address, the subject or the content (checked in the tests)
- [x] Branded templates (backend/utils/emailTemplates.js): one layout (CraftFlip wordmark, white card on warm stone, serif headings, a pill button, footer), table-based with inline styles for email clients, each template with an HTML and a plain-text version. All values HTML-escaped; names tidied and shortened; links must be absolute http or https without credentials. Colours are placeholders until the final brand colours are decided
- [x] Welcome email after the first successful sign-in of a new account. The sign-in upsert sets User.welcomeEmail.status to pending only when it creates the account, so accounts that existed before Milestone 12 never get one. The request that atomically claims the pending state sends it; repeat and simultaneous sign-ins cannot send it twice. Sent without delaying the response (not awaited); a per-account Idempotency-Key lets Resend drop a duplicate if a send is retried after an interruption
- [x] Failures: rate limits, server errors, network errors and timeouts are retried on a later sign-in after 15 minutes, at most 3 attempts in all; other failures (bad key, unverified domain, invalid address) and missing configuration end it (status failed or skipped). Accounts without an email address are skipped. No email problem, database error during the email step or slow provider can fail or delay authentication or sign-up (tested)
- [x] Upgrade confirmation and payment failure templates (Starter or Pro only), rendered and tested, not called from anywhere: no billing event, webhook or plan change was added
- [x] Automated tests, no Resend account or network needed (Resend mocked): backend 216 passing (183 before; new: template rendering, escaping, link and plan validation; configuration missing, blank, malformed and valid with the key never logged; delivery success with the exact request, permanent and retryable HTTP failures, network errors, timeouts, unreadable error bodies, invalid messages; the welcome state machine: one send, no repeat, existing accounts excluded, six simultaneous claims sending once, no address, not configured, retry after the lease with the same idempotency key, the attempt limit, permanent failure, an interrupted send, an invalid CLIENT_URL, errors swallowed; through the real requireAuth: first sign-in sends once and later ones do not, five simultaneous first sign-ins make one account and one email, an existing account gets none, sign-up succeeds quickly when delivery fails, throws or hangs). Frontend 85 passing, unchanged. Lint, production build and node --check on every backend file pass
- [x] Live check against the real MongoDB with the real requireAuth and User model (only Firebase token verification stubbed, no Resend key, a throwaway account removed afterwards): first sign-in 200, the new account stored as pending and then skipped ("Resend not configured" logged); a second sign-in changed nothing; one account; an existing account stores no welcome state
- [ ] Owner setup: create the Resend account, verify the sending domain flip.thecraftaxis.com (DNS records in Resend), put the API key in backend/.env and later in Railway (see README.md, Milestone 12)
- [ ] Owner check: sign up with a new account and confirm the welcome email arrives, looks right on a phone and a desktop mail client, and is not in spam. Real delivery has not been tested

Decisions not in the earlier documents (owner to confirm): the sender is CraftFlip <hello@flip.thecraftaxis.com>, a constant in backend/config/resend.js (not a new variable, because the variable list is fixed); the welcome email is sent whether or not the address has been verified (the app has no email verification); accounts created before Milestone 12 get no welcome email; the Resend REST API is called directly instead of the resend package, to add no dependency.

Limitations: no queue, so a welcome email that fails is retried only when the user next makes an authenticated request (after 15 minutes, up to 3 attempts); a server restart during the send leaves it to the next sign-in after 15 minutes (the idempotency key covers 24 hours); no unsubscribe or email preferences (transactional emails only); no open or click tracking; the template look is a first version for the UI/UX pass; reply-to is not set, so replies go to the sender address, which needs a mailbox if replies are wanted.

Environment: RESEND_API_KEY (already in the variable list and .env.example); CLIENT_URL is used for the dashboard link in emails. No new variables or packages.

### Recommended next milestone

Milestone 11 (Paddle billing) once the Paddle account is approved; it can then send the prepared upgrade and payment failure emails from its verified webhook handler. Otherwise Milestone 13 (OG image generation). The Resend setup and delivery check above can be done at any time.

---

## Milestone 10: Analytics tracking and dashboard

Status: Implemented, not yet complete: waiting for the owner's checks and one owner decision (the unchecked criteria). Details, definitions and the API in REFERENCE.md, "Analytics (Milestone 10)".

Goal: Owners see how their published flipbooks are viewed: views, unique visitors, views over time, which flipbooks attract attention, which pages are seen, devices and where visitors come from, without third-party analytics and without collecting personal data.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] Data model as confirmed ("Analytics data model"): one ViewSession document per reading session (flipbookId, ownerId copied from the flipbook, a random first-party visitorId, startedAt, lastSeenAt, pagesViewed, deviceType, referrerHost, embedded, country), updated in place while the visitor reads; not one record per page turn. Indexes: ownerId+startedAt, flipbookId+startedAt, flipbookId+visitorId+lastSeenAt
- [x] Definitions (shown on the dashboard): a view is one reading session; reloads and returns by the same visitor within 30 minutes of their last activity continue it. A unique visitor is one browser's random visitor ID with at least one view in the period. Pages per view averages the distinct pages seen per view. A page view counts the views in which that page was on screen for at least a second (turning back to it in the same view does not count again)
- [x] Tracking only from the public viewer and embeds, through POST /api/public/flipbooks/:slug/activity, which accepts reports only for published, Ready flipbooks (404 otherwise, nothing stored). One report when the flipbook opens, page reports batched at most every 10 seconds, a last report when the page is hidden or closed. Reports are validated (visitor ID format, page numbers within the book, no other fields), 4 KB at most, 600 per IP per 15 minutes; crawlers and requests without a user agent are ignored; a failed write never affects reading
- [x] Owner previews are never counted (they use owner routes); the owner opening their own public link or embed is not counted in a browser where they have opened the dashboard or the preview (their slugs are remembered locally). Browsers sending Global Privacy Control or Do Not Track are not tracked
- [x] Privacy: no IP address, user agent string, full referrer URL or cookie is stored (the referrer is reduced to its host; the device to mobile, tablet or desktop). Owners receive counts only, never visitor IDs. No third-party script or service
- [x] Owner reports behind requireAuth: GET /api/analytics (account) and GET /api/analytics/flipbooks/:id, filtered by the signed-in user's ID (never an ID from the request), periods 7d, 30d, 90d and all, days in the owner's time zone, validated parameters (400), 404 for another owner's flipbook, 300 reports per user per 15 minutes
- [x] Dashboard Analytics section: period buttons, cards for views, unique visitors and pages per view, a views-over-time chart (per day, per month for all time; hover, tap or arrow keys for each value; a table view), devices and sources, every flipbook with its views, visitors and last view (most viewed first), and per flipbook its own chart, most viewed pages, devices and sources. Loading, empty (with or without published flipbooks), error with Try again, and a failed refresh keeping the previous figures. Fits 390px without horizontal scrolling
- [x] Unpublished and deleted flipbooks stop counting at once; deleting a flipbook removes its analytics
- [x] Automated tests: backend 183 passing (activity recording and its filters, country headers sent by a client ignored, unpublished, deleting, missing and malformed slugs, malformed, oversized and out-of-range reports, crawlers, write failures, the rate limit; session continuation within 30 minutes; report ownership, periods, time zones including a daylight-saving change, empty data, aggregation shape without visitor IDs, per-flipbook 404s, 401 without a token, analytics removal on deletion). Frontend 85 passing (the one-second rule, batching, the final report, report order, refusal and retry, visitor ID and the owner's own flipbooks, privacy signals, the request format; report states, scale, columns, labels, sources, devices). Lint, production build and node --check on every backend file pass
- [x] Browser check (Chrome, local servers, the real database, a temporary 8-page published flipbook, deleted afterwards with its analytics; the database then held no view sessions): the owner opening the public link sent no reports; a simulated new visitor (this browser's owner marker and visitor ID cleared) read pages 1, 2, 3 and 5 and flipped past page 4 quickly: 1 view, 1 unique visitor, pages 1, 2, 3 and 5, desktop, counted on today in Asia/Dhaka; reopening and a reload within 30 minutes stayed 1 view and added page 8; a second simulated visitor in an embed made 2 views and 2 visitors, labelled as embedded; the dashboard showed the cards, the chart with its tooltip, the table view, devices, sources, the flipbook list and the per-flipbook detail; all time grouped by month; after unpublishing, a report returned 404 and nothing was added; after deletion the reports returned 404 and the account totals were zero; the empty state showed. Found and fixed: zero values drew a small bar
- [x] Country decision (October 2026): country may only come from a country-code header set by trusted hosting or proxy infrastructure; no stored IP address, no GeoIP package, no geolocation API or new service. Checked on 17 October 2026: the current deployment has no such header (the browser sends reports straight to Railway, whose edge adds no country header; Vercel's geolocation headers apply only to requests that reach Vercel). Country therefore stays unavailable: ViewSession.country is stored as null, never guessed, and any country header a client sends is ignored (tested). What would enable it later is in REFERENCE.md, "Analytics", "Visitor country"
- [ ] Owner check: visits from real phones and other computers (with the dashboard open in your own browser), including an embed on another website, then the figures on the dashboard
- [ ] Owner check: the error state (stop the backend, open the dashboard, Try again after restarting)

Limitations: unique visitors are per browser (another browser, device or private window is another visitor; clearing site data makes a new one); in browsers that partition storage, an embed on another site has its own visitor ID; visitors whose storage is blocked count as a new visitor on each page load; visits from browsers with privacy signals, the owner's own browser and crawlers are not counted; the referrer is often missing (apps, email, messaging); the last pages of a visit are lost if the browser closes before the final report is sent; time spent reading is not reported (lastSeenAt only records the last activity); daily unique visitors are counted per day, so they do not add up to the period's unique visitors; plan gating ("Basic view stats" on Free, "Full analytics" on Starter in the proposed pricing) is not enforced (billing is Milestone 11).

Environment: no new variables, packages or accounts.

### Next milestone after Milestone 10

Milestone 11 (Paddle billing) was recommended, but the owner postponed it (Paddle account setup blocked) and Milestone 12 (email) was built next; see the top of this file. The owner checks above and the earlier deployment checks still apply; a test deployment is worth considering (the owner's decision).

---

## Milestone 9: Branding, call to action, reader settings and embed

Status: Implemented, not yet complete: waiting for the owner's checks (the unchecked criteria). Built as Milestone 9 at the owner's request; Analytics moved from 9 to 10 (October 2026).

Goal: An owner customises how a flipbook's reader looks and behaves for visitors (logo, colours, a call-to-action button, PDF download) and embeds a published flipbook on their own website.

Before this milestone nothing of it existed: no reader settings, no logo storage, no download route, no embed route.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] (accentColor superseded by the background, see the follow-up below) Settings stored on the flipbook under reader: primaryColor and accentColor (#rrggbb or null for the default), logo (private image details, never sent to a client), cta { enabled, label, url }, allowDownload. Defaults keep the previous reader: CraftFlip colours, no logo, no button, no download. Existing flipbooks read as the defaults without migration
- [x] (accentColor replaced by background in the follow-up below) Saved through the existing PATCH /api/flipbooks/:id with { reader: { ... } } next to title, link and style. Only primaryColor, accentColor, cta (always sent whole: enabled, label, url) and allowDownload are accepted; anything else, including the logo, is refused with 400 and nothing is written. Colours must be 6-digit hex. Labels are tidied and at most 40 characters. Links must be absolute http or https addresses with a real host name and no embedded user name or password; javascript:, data:, relative and protocol-relative links are refused, also for a switched-off button. A shown button needs a label and a link. Owner only (404), not while deleting (409)
- [x] Logo: POST /api/flipbooks/:id/logo (multipart, field "logo", at most 2 MB) accepts PNG, JPEG or WebP identified by the file's bytes (SVG and anything else refused). It is re-encoded with sharp as WebP within 640x240 (metadata and non-image content dropped) and stored as a private Cloudinary image under the flipbook's own branding folder. Replacing deletes the previous file; DELETE /api/flipbooks/:id/logo removes it. If a deletion starts during an upload, the new file is removed again. Deleting the flipbook removes the branding folder with everything else
- [x] The logo is served like page images: to the owner through GET /api/flipbooks/:id/logo, and to visitors of a published flipbook through GET /api/public/flipbooks/:slug/logo (publication checked on every request). No Cloudinary address reaches a browser
- [x] (placement superseded: now a floating button, see the follow-up below) Call to action: shown in the reader's top bar only when switched on, labelled and pointing to a link that passes the same check again on the way out (server and browser). Opens in a new tab with rel="noopener noreferrer nofollow". Coloured with the primary colour and readable text
- [x] PDF download: GET /api/public/flipbooks/:slug/download streams the original through the server only when the flipbook is published, Ready and allowDownload is true, all checked in the database query on every request; otherwise the same 404 as a missing flipbook. No public response contains a PDF address; the reader shows the download button only when allowed. 20 downloads per IP per 15 minutes. The owner can always download their own original through GET /api/flipbooks/:id/original. Turning downloads off cannot stop screenshots or copying of what is on screen
- [x] (accentColor replaced by background in the follow-up below) Public metadata adds reader { primaryColor, accentColor, logo { width, height, revision } or null, cta { label, url } or null, allowDownload } and nothing else
- [x] Embed: /embed/[slug] is the public viewer in embed mode (slimmer bar, an Open full screen link to /view/[slug]); it uses the same public API, so unpublished, deleted and unknown flipbooks show "This flipbook doesn't exist or has been removed." The owner gets iframe code (responsive 3:2, or a fixed width or 100% and a height) with Copy and a select-to-copy fallback; the title is escaped in the code. vercel.json lets only /embed/* be framed by other sites (frame-ancestors *) and sends X-Frame-Options DENY and frame-ancestors 'none' everywhere else (checked after deployment)
- [x] (dialog regrouped in the follow-up below) Owner interface: a Customize button in the preview (and a sliders link on each Ready dashboard row, opening the preview with ?customize=1) opens one dialog: logo upload, replace and remove (saved immediately), button and top-bar colours with "Use default", the call to action, the download switch, and the embed code (or a note that the flipbook must be published). The preview shows the saved settings as visitors see them. Title and link editing, style picker, publishing, conversion progress, retry and delete are unchanged
- [x] (top-bar colour removed in the follow-up below) Brand colours apply to the top bar (accent), the button and the navigation arrows (primary) in all four styles
- [x] Automated tests: backend 142 passing (validation of colours, links including unsafe schemes, the button rules and allowlists; defaults for old and new flipbooks; reader settings saved as individual fields and invalid ones refused without a write; logo type, size, ownership, re-encoding, replacement, removal and the deletion race; branding files removed with the flipbook; owner original download; public download allowed, disabled, unpublished and deleting; public logo; public field filtering; 401 for every new owner route). Frontend 49 passing (defaults and restore, form checks, saved body, button visibility with unsafe links and both API shapes, readable text colour, logo calls, public addresses, embed code). Lint, production build and node --check on every backend file pass
- [x] Browser check (Chrome) with a temporary published flipbook in the owner's account (removed afterwards, with its files): logo uploaded through the dialog and shown in the preview, public viewer and embed; colours applied to the bar, button and arrows; an unsafe javascript: link refused with a message; the button opened https://www.example.com/book-a-viewing with the right rel; a real download of the original PDF through the public route (application/pdf, attachment); downloads switched off: no button and a 404; Editorial and page-flip styles kept the branding; a 390px embed with no horizontal scroll; after unpublishing, the embed showed the not-found message and download and logo returned 404; removing the logo deleted its file. This check found and fixed one bug: the public viewer hid the button because the public API sends a shown button without an enabled flag
- [ ] Owner check: customise one of your flipbooks, publish it, open the public link and test the button and download on a phone
- [ ] Owner check after deployment: paste the embed code into a real web page; confirm framing works for /embed/* and is refused for other pages

Plan preparation (nothing enforced yet; billing is Milestone 11): the proposed pricing gives Starter and Pro the call to action, embed code and no CraftFlip branding, and Free shows CraftFlip branding. All settings live under reader, and the embed is a route, so each can be gated later by the plan read from MongoDB without changing the data model. Today every plan can use everything here, and the "CraftFlip" mark stays in the public bar for everyone.

Limitations: one logo per flipbook (no account-wide brand kit); a replaced logo may show for up to five minutes in a visitor's browser cache; downloads pass through the backend (up to 50 MB each); embed framing rules are only active on Vercel.

Environment: no new variables.

### Milestone 9 follow-up: reader background, floating call to action, regrouped dialog (October 2026)

Status: Implemented, waiting for the owner's checks (the unchecked criteria). Built at the owner's request from "Product Decisions for the Future UI/UX Pass" before Milestone 10; not a new milestone, so the numbering is unchanged. The visual refinement of these features still belongs to the later UI/UX pass.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] The top-bar colour is gone from the dialog, the API and the reader. reader.accentColor is no longer accepted (400) or sent; values stored on older flipbooks are ignored. The top bar keeps the CraftFlip colours
- [x] Reader background stored as reader.background { kind: default | color | preset | image, color (#rrggbb or null), preset (allowlisted id or null), image (private, like the logo, plus tone light or dark) }. Default for existing and new flipbooks: the plain reader, with no migration. A colour kind without a colour, an unknown preset or the image kind without an image reads as the default
- [x] Saved through PATCH /api/flipbooks/:id with reader.background sent whole ({ kind, color, preset }, nothing else) and written as individual fields, so the uploaded image is kept. The colour kind needs a hex colour, the preset kind an allowlisted preset; the image itself can never be set here. Owner only (404), not while deleting (409)
- [x] Four bundled preset images (Ivory marble, Pale stone, Warm wood, Misty forest) in frontend/public/reader-backgrounds: CC0 files from Wikimedia Commons, licence checked through the Commons API, recorded in CREDITS.md, re-encoded to WebP (28-500 KB). Temporary placeholders for the visual-design phase. No image API and no new dependency
- [x] Uploaded background: POST /api/flipbooks/:id/background (multipart, field "background", at most 8 MB) accepts PNG, JPEG or WebP by their bytes (SVG and anything else refused), re-encodes with sharp as WebP within 2560x2560 (metadata dropped, transparency flattened onto white), measures whether it is light or dark, stores it privately under the flipbook's branding folder and makes it the chosen background. Replacing deletes the previous file; DELETE /api/flipbooks/:id/background removes it (the reader then shows the default); a deletion that starts during the upload removes the new file; deleting the flipbook removes the branding folder with it
- [x] Delivery like the logo: GET /api/flipbooks/:id/background for the owner, GET /api/public/flipbooks/:slug/background for visitors only while the flipbook is published, Ready and the image is the chosen background (checked in the query on every request). No Cloudinary address or ID reaches a browser
- [x] Public metadata sends only the background in use: { kind: "default" }, { kind: "color", color }, { kind: "preset", preset, tone } or { kind: "image", revision, tone }. A stored colour, preset or image that is not chosen is not sent
- [x] The background fills the reader stage behind the pages (cover, centred; images on their own layer with a 6px blur and a neutral wash matching their tone, solid colours drawn as they are) in the owner preview, the public viewer and the embed, for all four styles, only while the book is on screen (loading and error messages keep the plain background). On a background the page navigation sits on a light pill, and Editorial page numbers turn light on dark backgrounds
- [x] Floating call to action at the bottom right of the reader stage in all four styles, the owner preview, the public viewer and the embed. It stays in place while pages turn. On stages at least 720px wide it sits beside the centred navigation; on narrower ones a 44px strip is kept free below the navigation and the book is fitted above it, so it never covers pages, page corners or controls. Offsets respect safe-area insets. Shown only when switched on, labelled and with a link that passes the check again; same rel="noopener noreferrer nofollow" and new tab; coloured with the button colour; label and link unchanged
- [x] Customize dialog in three groups: Appearance (logo, reader background, button colour), Actions (call to action) and Reader settings (downloads, embed code). The viewing style is chosen only in the preview page's toolbar. Logo and background image save straight away; the rest with Save settings, which stays visible while the dialog scrolls. The dialog fits a 390px screen without horizontal scrolling
- [x] Automated tests: backend 152 passing (background validation, defaults and fallbacks, public filtering, the retired accentColor refused and never sent, schema checks, background upload type, size, re-encoding, tone, replacement, removal, the deletion race, owner and public delivery, publication and choice checks, branding cleanup on deletion, 401 for the new routes; all earlier suites unchanged). Frontend 57 passing (both API shapes, form checks, saved body, how each background is painted, preset files present, upload and removal calls, button placement on wide and narrow stages). Lint, production build and node --check on every backend file pass
- [x] Browser check (Chrome, local servers, a temporary published flipbook in the owner's account, deleted afterwards with its files): preset chosen and the button switched on through the dialog and saved; the preset showed behind the pages in Luxury Flip, Classic Book (open spread), Clean Swipe and Editorial; a generated JPEG uploaded through the background route (re-encoded, chosen, light tone) and shown in the public viewer and in embeds; at 390x844, 360x640, 640x427 and 320x568 the button covered neither the book nor the navigation, with no horizontal scrolling and the right rel and target; a solid colour shown in the owner preview and public viewer; a colour kind with an invalid value and accentColor both refused with 400; with the button switched off the public API sent no button while the owner kept the label and link; removing the image returned the default and 404s; after unpublishing, metadata and background returned 404; deleting the flipbook succeeded, which includes removing its branding folder. Found and fixed during the check: the dialog's sticky Save bar let content show beneath it, its colour rows overflowed at 390px, and the preview's Dashboard link overlapped the title on phones (now icon only). Not covered: choosing a file through the dialog's own file picker (the automation cannot open it), real phones
- [ ] Owner check: in the Customize dialog upload your own background image, try a preset and a colour, and look at the preview, the public link and an embed on a real phone (including a phone with a notch)
- [ ] Owner check: the floating button on a phone in each style, and that it never hides content you care about
- [x] Refinements (October 2026): viewing style removed from the Customize dialog (still in the preview toolbar); background images softened in the browser only (separate layer behind the stage content with blur(6px), extended beyond the edges and clipped so no soft rim shows, plus rgba(250, 250, 249, 0.45) on light images or rgba(28, 25, 23, 0.3) on dark ones; the stored and bundled files are unchanged); the style selector row centred on the viewport, with drawings hidden below 640px and wrapping onto two lines on the narrowest screens instead of scrolling. Browser check (Chrome, temporary published flipbook, deleted afterwards): the dialog has no style control and the toolbar has all four; the group centre measured at 960 of 1920px; one line at 390px, two lines at 320px, no horizontal overflow; Warm wood, Pale stone, Ivory marble, Misty forest and a deliberately busy uploaded image subdued in the owner preview, public viewer and embeds; no filter on the pages, navigation or button (the book keeps only its existing drop shadow); a style chosen in the toolbar saved and reached the public API
- [ ] Owner check: judge the softened backgrounds and the centred toolbar on your own screens and phone

Limitations: background presets are temporary placeholders; one background image per flipbook; a replaced or no longer chosen background may stay in a visitor's browser cache for up to five minutes (like logos and pages); safe-area offsets only take effect if the page is later given viewport-fit=cover (today browsers already keep the page inside the safe area); the button cannot be dismissed (left to the UI/UX pass); on narrow screens the book is up to 44px smaller when the button is shown.

Environment: no new variables, packages or accounts.

### Reader navigation toolbar (October 2026, before Milestone 10)

Status: Implemented, waiting for the owner's checks (the unchecked criteria). Not a numbered milestone; the roadmap is unchanged and Milestone 10 (Analytics) is next. Details in REFERENCE.md, "Reader toolbar".

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] One toolbar in all four styles, the owner preview, the public viewer and embeds: page overview, previous and next, the pages on screen and the total, a page box to type a page number, zoom out, Fit (shows the zoom level), zoom in and fullscreen. It replaces the previous arrows and page counter in the same place; each style keeps its own page-turn or transition engine
- [x] Direct page entry: whole page numbers within the book; on a spread it opens the spread holding that page; an invalid number is marked and nothing moves
- [x] Page overview: previews with page numbers, the pages on screen marked, choosing one goes there. Previews are 240px WebP versions made by Cloudinary on request (?size=thumb on the existing owner and public page routes, under the same access checks), loaded only when scrolled into view, reusing full pages already loaded; a failed preview shows "Preview unavailable" and stays clickable; closes with its button or Escape; fits phone screens
- [x] Zoom from 100% to 250% in fixed steps with proportions kept and scrolling to see the rest; page turning still works while zoomed; Fit returns to the whole page
- [x] Fullscreen of the reader stage through the Fullscreen API (with the webkit fallback); the button is hidden where fullscreen is not available
- [x] Responsive: all controls from 600px, fewer on phones (no horizontal overflow at 320px), 44px touch targets on touch screens, the floating button never overlaps the toolbar (beside it only from 980px), bottom safe-area inset
- [x] Automated tests: backend 156 passing (preview size on owner and public routes, other sizes refused before any lookup, previews of unpublished flipbooks refused, the variant rules). Frontend 66 passing (zoom steps and layout, page entry, pages on screen against the page label, toolbar modes, preview loading limits, retries, cancelling and cleanup, the Fullscreen API and webkit fallback, button placement with the wider toolbar). Lint, production build and node --check on every backend file pass
- [x] Browser check (Chrome, local servers, a temporary 24-page published flipbook, deleted afterwards): in the owner preview with Luxury Flip, typing 10 opened 10-11; the overview marked 10 and 11 and focused the current page, fetched previews only for pages 15-24 because 1-14 were already loaded, and choosing 19 opened 18-19 and closed it; zoom to 200% kept A4 proportions, scrolled and stayed centred, Next worked while zoomed, Fit returned. Classic Book, Clean Swipe and Editorial each passed page entry, refusal of an out-of-range number, next, previous, overview marking and choice, zoom, next while zoomed and Fit. Public viewer at 390x700 and 320x568 and embeds at 360x640 and 768x512: the right toolbar for each width, no horizontal overflow, the button never over the toolbar; the overview at 390px had three columns and loaded previews as it scrolled. After unpublishing, a public preview returned 404. Found and fixed during the check: the Fit button's tap area had collapsed to its text, touch targets were 36px, and the page box could not fit long labels such as 100-101
- [ ] Fullscreen: Chrome under automation refused the request ("not granted") although the click reached the code with a user gesture, so entering and leaving fullscreen is not verified. Owner check: press the fullscreen button on a computer and on an Android phone, and check that it is hidden on an iPhone
- [ ] Owner check: a real embed on another website, with and without allowfullscreen on the iframe (cross-origin embedding could not be tested locally)
- [ ] Owner check: the toolbar, overview and zoom on a real phone and tablet with a real brochure

Limitations: zoom is through the toolbar (inside the reader there is no pinch-to-zoom beyond the browser's own page zoom, and no mouse-wheel zoom); while zoomed, pages turn with the toolbar or arrow keys rather than by dragging or swiping; in Classic Book the page count updates when the turn finishes (about two seconds, as before); fullscreen is unavailable on iPhone Safari, which has no element fullscreen; previews are created by Cloudinary on first request and count as transformations on the Cloudinary plan.

Environment: no new variables, packages or accounts.

### Next milestone after Milestone 9

Milestone 10 (analytics), now the current milestone (see the top of this file).

---

## Milestone 8: Dashboard and flipbook management

Status: Implemented, not yet complete: waiting for the owner's checks (the unchecked criteria). Secure deletion, its first part, is described below in its own section.

Goal: An owner can manage every flipbook from the dashboard: see its state, open it, edit its title and link, choose its style, publish or unpublish, copy its link, retry a failed conversion and delete it, with clear feedback and recovery from failures.

Audit before this milestone (what already worked): the list with status, page count and live conversion progress; Open (preview); Publish, Unpublish and Copy link; viewing style (in the preview); Convert and Retry; Delete with confirmation. Missing: editing the title, changing the link, retrying a failed load of the list or the account without reloading the page, and handling a flipbook deleted elsewhere (its row stayed, and a processing one was polled every second for ever).

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] Edit details (pencil button on each row, a dialog): title and public link. The existing PATCH /api/flipbooks/:id now accepts exactly title, slug, confirmSlugChange and viewerStyle; any other field (owner, status, publication, pages, files, plan and so on) is refused with 400 and nothing is written. Firebase token required; owner only (404 otherwise); a flipbook being deleted gives 409
- [x] Titles: control characters removed, spaces collapsed and trimmed, 1-120 characters (400 otherwise). Changing the title never changes the slug (Slug rules)
- [x] Links (Slug rules): 3-80 lowercase letters, numbers and single hyphens (the dialog tidies typing; the server validates). Before the first publish the link changes freely. After it, the server refuses with 409 and requiresConfirmation until confirmSlugChange is true; the dialog shows that the old link will stop working and needs a checkbox. The old published slug stays in the PublishedSlug registry, so the old link shows the not-found page and is never given to another flipbook; there are no redirects. A slug published by another flipbook or used by another live flipbook is refused ("That link is not available"); a flipbook may go back to one of its own old slugs. A published flipbook's new link is reserved before it goes live. Link changes run under the per-user publish lease, so they cannot interleave with a publish
- [x] A refused link change writes nothing (the slug is handled before the title and style)
- [x] The owner summary adds hasBeenPublished (whether the link has ever been public)
- [x] Actions on each row: Open, Edit details, style name (opens the preview where the style is chosen), Publish or Unpublish, Copy link (published only), Convert or Retry, Delete with confirmation. Rows are always replaced with the server's answer
- [x] Status shown from the existing fields only: Uploaded, Processing with stage and progress, Ready, Failed with the reason and Retry, Not fully deleted (a deletion whose cleanup failed; only Delete is offered), Published or Not published with the style
- [x] A flipbook deleted elsewhere: any action answering 404 (publish, unpublish, convert, edit, the conversion status check) removes its row with "This flipbook no longer exists.", and polling stops
- [x] Loading failures: the account card and the list show "Try again" and reload just that part
- [x] Automated tests: backend 122 passing (title rules, protected fields refused, link validation and confirmation passed through, refused link writes nothing, combined changes; slug logic against the in-memory store: free change before first publish, confirmation after, old slug retired and new one reserved, reserved at the next publish when unpublished, retired or taken slugs refused, returning to an own old slug, ownership, deleting, a link change racing a publish, a deletion during a link change; 401 with the real auth middleware). Frontend 35 passing (link tidying, only changed fields sent, local checks, save results for success, confirmation, missing flipbook and network failure). Lint, production build and node --check on every backend file pass. Publishing, style, conversion, retry and deletion suites still pass
- [x] Browser check (Chrome) with a temporary flipbook in the owner's account (removed afterwards with its test slugs): renamed and given the link "My Test Link 01" (tidied to my-test-link-01) without confirmation before publishing; published; changing the link of the published flipbook showed the warning, refused to save without the checkbox, then saved; the old link returned 404 and the new one 200 with the new title; both slugs were in the registry. After the record was deleted behind the dashboard, Unpublish removed the row with "This flipbook no longer exists." No console errors
- [ ] Owner check: rename and relink one of your own flipbooks, before and after publishing
- [ ] Owner check: the Try again buttons (they appear only when the API cannot be reached; stop the backend to see them)

Limitations and decisions for the owner:
- Link changes are open to every plan. The pricing table (proposed) lists custom slug editing under Pro; gating it is one check when billing exists (Milestone 11)
- Changing a published link has no redirect from the old link, by design (Slug rules); the old link shows the not-found page
- Style is still chosen in the preview page, not in the edit dialog

Environment: no new variables.

---

## Milestone 7: Flip styles and style picker

Status: Implemented, not yet complete: waiting for the owner's checks (the unchecked criteria).

Goal: All four viewing styles work in the owner's preview and the public viewer, and the owner chooses the style per flipbook.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] Four styles on one viewer engine (one page-image store, one navigation bar, two readers):
  - Luxury Flip (existing, unchanged): react-pageflip, 900ms turns, soft shadows, cover alone, spreads on wide screens
  - Classic Book: react-pageflip with slower 1100ms turns and deeper shadows, drawn as a bound book: a spine shadow down the middle and stacked page edges under an open spread
  - Clean Swipe: one page at a time on a horizontal track (300ms slide), swipe left or right, tap the left or right half, arrows and keys; always single page, also on desktop
  - Editorial: no page curl; each step fades in (450ms, off with reduced motion); spreads on wide screens (cover alone, then 2-3, 4-5, ...), single pages on narrow ones; extra white space and small page numbers under each page
- [x] Every style shows the same converted pages in their original order, with the same page indicator, previous/next buttons, arrow keys, loading placeholder and failed-page retry. No new uploads or conversions are needed for existing flipbooks
- [x] Style stored on the flipbook as viewerStyle, one of luxury-flip, clean-swipe, classic-book, editorial (allowlist in backend/utils/viewerStyles.js, also enforced by the schema), default luxury-flip. Records created before Milestone 7 have no value and read as luxury-flip everywhere
- [x] PATCH /api/flipbooks/:id { "viewerStyle": "editorial" }: Firebase token required (401), owner only (another user's or a missing flipbook: 404), any value outside the allowlist or any other field: 400, a flipbook being deleted: 409, 120 changes per user per hour (429). It changes only viewerStyle: publication, slug and pages are untouched, so a published link keeps working and needs no republish
- [x] The owner's summary (dashboard list and preview) includes viewerStyle; the public metadata includes viewerStyle and nothing else new. The public API still requires a published, Ready flipbook; a style never makes anything public
- [x] Style picker in the owner's preview (/flipbooks/:id, opened with Open on the dashboard): the four styles with names, small drawn previews and descriptions, the current one marked. Choosing one switches the viewer at once and saves it; on failure the previous style comes back and the server's message is shown. The dashboard rows show each Ready flipbook's style name
- [x] The public viewer (/view/[slug]) opens in the saved style; switching style takes effect on the next load of the link (public metadata is never cached)
- [x] Automated tests: backend 107 passing (default and legacy records, all four styles accepted, invalid values and other fields refused without a database write, ownership 404, deleting 409, only viewerStyle written, 401 with the real auth middleware, public response includes the style and no private fields, unknown stored values fall back, an unpublished flipbook stays hidden). Frontend 30 passing (style list matches the backend, restore and fallback, save success and failure messages, spread and single page order for the CSS styles). Lint, production build and node --check on every backend file pass
- [x] Browser check (Chrome) with a temporary 5-page flipbook in the owner's account (removed afterwards): Luxury Flip 1, 2-3, 4-5 with Next disabled at the end; Clean Swipe 1, 2, 3 on a sliding track; Classic Book cover alone, then 2-3 with the spine; Editorial 1, 2-3, 4-5 with Next disabled at the end. The choice was saved (MongoDB and the public API said editorial), restored after a reload, and used by the public link. At 390px the public link showed Editorial and Clean Swipe as single pages with no horizontal scroll; a swipe left, swipe right and tap moved 1 to 2, back to 1, and to 2. A failed save (flipbook being deleted) showed the server message and restored the previous style. Existing flipbooks show Luxury Flip. No console errors
- [x] Bug fix (October 2026): Luxury Flip opened blank (page 1 stuck on its loading spinner, no image requested) in development until another style was chosen. Cause: since Milestone 7 the page-image store lives in FlipbookReader while each reader asks for pages in its own effect; React runs a child's effects before its parent's, and StrictMode (development) closes and reopens the store, so the reader's request arrived while the store was closed and reopening did not resume it. Switching style remounted only the reader, which is why it then worked. The store now resumes loading around the last requested page when it is reopened (utils/pageImageStore.js), with regression tests that replay that order. The Milestone 7 browser check had recorded this first page as "loading" and attributed it to slow loading; that was this bug. Verified after the fix: page 1 shows on opening from the dashboard and after a refresh, forward and back, all four styles, and back to Luxury Flip. Production builds (no StrictMode) followed the working order, so the bug showed in local development; the fix makes the order irrelevant
- [ ] Owner check: try the four styles on the real 20-page brochure, choose one for a published flipbook, and open its public link
- [ ] Owner check on a real phone: swiping in Clean Swipe, page turns in Luxury Flip and Classic Book, Editorial single pages

Limitations:
- The picker is in the owner's preview page, next to a live preview, rather than on the dashboard list itself; the dashboard shows the style name and Open leads to the picker
- Switching style starts the reader again at the cover
- Classic Book differs from Luxury Flip through speed, shadow depth, spine and page edges; react-pageflip has no setting for the curl shape itself
- Visual polish of all four styles belongs to the later UI/UX pass

Environment: no new variables. New field viewerStyle on flipbooks; no migration.

---

## Milestone 6: Publishing and public sharing

Status: Implemented, not yet complete: waiting for the owner's checks (the unchecked criteria). Design, API contracts and trade-offs: REFERENCE.md, "Publishing and public sharing".

Goal: The owner of a converted flipbook publishes it and shares flip.thecraftaxis.com/view/[slug]. Anyone with the link can read it without signing in. Unpublishing or deleting stops new access at once. Visitors receive only the title, slug, page sizes and page images; never the original PDF, owner details, internal IDs or Cloudinary details.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] POST /api/flipbooks/:id/publish and /unpublish require a valid Firebase ID token (401 without one, tested against the real requireAuth) and act only on the user's own flipbook; another user's or a missing flipbook returns the same 404
- [x] Only a Ready flipbook can be published (409 for uploaded, processing and failed; 409 "being deleted" for deleting). Publishing a published flipbook and unpublishing an unpublished one return 200 with the current state and change nothing
- [x] Publication is separate from status: isPublished, publishedAt, firstPublishedAt and unpublishedAt on the flipbook. A flipbook is public only while status is ready and isPublished is true, checked in every public query
- [x] Stable URL /view/[slug]: the existing slug, unchanged by unpublish and republish. Every published slug is recorded permanently in the PublishedSlug registry (unique index), kept when the flipbook is deleted, so an old link can never show a different flipbook. New uploads skip retired slugs; a never-published flipbook whose slug turns out to be retired gets a new slug at publish. A publish that does not happen releases its reservation
- [x] Plan limit on published flipbooks: Free 3, Starter 10, Pro unlimited (planLimits.js, from the pricing table). Only published, Ready flipbooks count; unpublishing or starting a deletion frees a slot; republishing needs one. The 4th publish on Free returns 403 "Your Free plan allows 3 published flipbooks at a time. Unpublish or delete one to publish this flipbook." Publishes are serialised per user with a lease on the user document, so simultaneous requests cannot exceed the limit
- [x] GET /api/public/flipbooks/:slug returns { slug, title, pageCount, pages: [{ pageNumber, width, height }] } built field by field, with Cache-Control no-store. Unpublished, never-published, deleting, unconverted, missing and malformed slugs get the identical 404 "Flipbook not found."
- [x] GET /api/public/flipbooks/:slug/pages/:pageNumber streams one page image (one page at a time, never the whole flipbook) fetched server-side from the verified record; publication is checked on every request. Invalid page numbers (0, negative, fractions, text, beyond the page count) return 404 without fetching. The request cannot choose what the server fetches. Cache-Control private, max-age=300; X-Robots-Tag noindex, nofollow
- [x] Public responses contain no owner details, MongoDB IDs, original filename or size, Cloudinary public IDs, URLs or versions, tokens or credentials (asserted on serialized responses in tests and in the live check). The original PDF is never reachable through a public endpoint, and no Cloudinary delivery or access setting was changed
- [x] Starting a deletion unpublishes in the same atomic update; a deletion racing a publish never leaves a deleting flipbook published (unit test across 13 interleavings and a live race)
- [x] Rate limits: publish and unpublish 60 per user per hour; public metadata 300 and public images 3000 per IP per 15 minutes (three full reads of a 50-page flipbook stay far below it), all with structured 429s
- [x] Public viewer at /view/:slug: loaded separately from the signed-in app, so it never loads Firebase or starts an auth session (checked in the production build and in the browser's resource list), never redirects to /login, reuses the Milestone 5 reader (Luxury Flip), and shows "This flipbook doesn't exist or has been removed." for every not-found case. robots noindex, nofollow meta tag; X-Robots-Tag on the public API
- [x] Dashboard: "N of 3 published on the Free plan" (with how to free a slot at the limit), Published or Not published per Ready row, Publish, Unpublish and Copy link (with a selectable-link fallback when the clipboard is refused), buttons disabled with a spinner while a request runs, toasts for success and errors
- [x] Automated tests: backend 87 passing (publishing logic against an in-memory fake that interleaves concurrent requests: ownership, states, idempotency, slug stability and retirement, simultaneous slug claims, plan limits, simultaneous publishes, publish versus delete, lock busy and expired lease; owner and public routes; leakage, headers, invalid pages, request-controlled fetching, rate limits; summary fields; bounded stream). Removing the lock makes three of them fail, as intended. Frontend 16 passing. Lint, production build and node --check on every backend file pass
- [x] Live check against the real MongoDB, Cloudinary and the running local backend, with a throwaway user, flipbooks and page images (all removed afterwards; the three real flipbooks untouched and unpublished): 5 simultaneous publishes on Free gave 3 published and two 403s; public metadata and a real WebP page over HTTP without a token, with the documented headers and no internal IDs; 404 immediately after unpublish and after a deletion started; republish kept the slug; the slug stayed retired after deletion and a new flipbook with that slug got a fresh one; publish versus delete left the flipbook unpublished
- [x] Browser check (Chrome, desktop) with a throwaway published 3-page flipbook: /view/[slug] showed page 1, then 2 | 3, Next disabled at the end, title in the tab, no Firebase loaded, only public API calls; after unpublishing, a reload showed the not-found message. The dashboard showed "0 of 3 published on the Free plan" and Publish on both Ready rows (not clicked: real flipbooks were not published)
- [ ] Owner check: publish a flipbook from the dashboard, Copy link, open the link in a private window (signed out), flip pages, unpublish, reload the link: not-found message. Publish a 4th flipbook on Free: limit message
- [ ] Owner check on a real phone with a published link
- [ ] After deployment (Milestone 14): /view/* loads through the Vercel rewrite and carries X-Robots-Tag (frontend/vercel.json; not testable locally)

Environment: no new variables. New MongoDB collection publishedslugs (created automatically with its unique index); new fields need no migration (missing means unpublished).

Security and privacy limits:
- Unpublishing or deleting blocks every later request. It cannot take back what visitors already have: pages shown in an open tab, pages in their browser cache (up to 5 minutes), downloads or screenshots
- Published page images pass through the backend: each uncached full read of the 20-page brochure is about 5 MB of Railway egress and Cloudinary bandwidth (Free plan: 25 credits a month)
- Other sites can hotlink public page images; per-IP limits cap the cost
- Visitors behind one shared address share the per-IP limits
- noindex depends on crawlers honouring the meta tag (JavaScript crawlers) or the X-Robots-Tag header from Vercel (after deployment). It is not access control: anyone with the link can view
- If the server stops during a publish, the user's publish lease expires after 15 seconds; a slug reserved by that interrupted first publish stays retired (harmless)

What is NOT part of this milestone: embeds, OG previews, CTA, analytics, branding, slug editing, custom domains, other flip styles, billing.

---

## Milestone 8, first part: Secure flipbook deletion (built before Milestone 6)

Status: Implemented, not yet complete: waiting for the owner's end-to-end check in the browser (the unchecked criterion). The rest of Milestone 8 (full dashboard and other management) is not started. Built before Milestone 7 with the owner's approval (October 2026); Milestone 7 is unchanged and still to do.

Goal: A signed-in user permanently deletes their own flipbook, and everything it stored in Cloudinary is removed with it.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] DELETE /api/flipbooks/:id requires a valid Firebase ID token (structured 401 without one, tested against the real requireAuth) and is rate limited per user (60 per hour, structured 429)
- [x] Ownership is checked on the server: the flipbook is claimed with one atomic update filtered by _id and ownerId. Another user's flipbook, a missing flipbook and an invalid ID all return the same structured 404, and nothing is deleted
- [x] Order of operations: the record is marked "deleting" first (so no conversion can start on it), then the original PDF and the page images of every conversion attempt are deleted from Cloudinary, and only then is the MongoDB record removed. Response: { success: true, data: { id } }, with no Cloudinary details
- [x] Only the flipbook's own files are deleted: the original PDF by its stored public ID, which must equal craftflip/users/<ownerId>/flipbooks/<flipbookId>/original.pdf or the deletion is refused, and page images by the prefix craftflip/users/<ownerId>/flipbooks/<flipbookId>/pages/. All three existing records were checked read-only and match
- [x] Files already missing count as deleted, so repeating a deletion is safe. If any file cannot be deleted, the response is a structured 502 ("couldn't delete all of this flipbook's files ... try deleting it again"), the record is kept as "deleting", and deleting again retries the cleanup. Success is never reported while files remain
- [x] Starting a deletion also unpublishes the flipbook in the same atomic update (Milestone 6), so a deletion whose file cleanup fails never leaves a public link working. The PublishedSlug registry is not touched: a published slug stays retired
- [x] A flipbook that is converting cannot be deleted (structured 409); the Delete button is disabled while it converts. Conversion writes only while status is processing, so no page images can be added after deletion starts. A flipbook being deleted cannot be converted (409) and the viewer shows it as not found
- [x] Dashboard: a Delete button on each row opens a confirmation dialog (Cancel, Escape or the backdrop close it). While the request runs the button shows a spinner and is disabled, and a second request for the same flipbook is ignored. On success the row is removed without a reload and a toast confirms it. On failure a toast shows the server's message and the row shows the flipbook's current state from the server (for example "Not fully deleted"), so the user can retry
- [x] Free plan limit: no flipbook-count limit is enforced in the code yet (it is deferred until publishing; see Milestone 3). Deletion removes the record completely, so it frees a slot for any future count. No plan logic was added or changed
- [x] Automated tests: npm test in backend, 55 passing (route tests for owner deletion, 401, foreign and missing 404, 409 while converting, 502 on cleanup failure with the record kept, retry, repeat after deletion, 503 without Cloudinary, no conversion while deleting; storage tests against a fake Cloudinary for removing the PDF and every attempt's pages and nothing of other flipbooks, repeat deletion, failures reported, batching, and refusing a PDF ID outside the flipbook folder). npm test in frontend, 11 passing (row removed on success or when already gone; row kept with the server's state on failure, refusal and network error). Lint, production build and node --check on every backend file pass
- [x] Live check against the real Cloudinary account with throwaway files under a random user and flipbook folder (MongoDB and existing data untouched): a 1-page PDF and two page images from two attempts were deleted (before 1 PDF and 2 images, after 0 and 0), and repeating the deletion caused no error
- [x] Browser check (Chrome on desktop): the Delete buttons appear, the dialog names the flipbook, Cancel and reopening work, no flipbook was deleted, no console errors
- [ ] Owner check: upload a throwaway PDF, let it convert, delete it from the dashboard, and confirm the row disappears and its folder is empty in the Cloudinary Media Library

Environment: no new variables.

Known limits:
- Cloudinary may keep the empty folders (craftflip/users/<user>/flipbooks/<flipbook>/...) after the files are deleted. They hold no files and cost nothing; removing empty folders can be added later
- A deletion interrupted by a server restart leaves the record as "deleting" ("Not fully deleted" on the dashboard); deleting again finishes it. There is no automatic background retry

What is NOT part of this step:
- The rest of Milestone 8: renaming, slug editing, the full dashboard
- Undo or a trash folder (deletion is permanent, as the dialog says)
- Free plan limit enforcement (needs publishing)

---

## Milestone 5: Flipbook viewer (Luxury Flip, first style only)

Status: Implemented, not yet complete: waiting for the owner's checks on a real phone and a page-by-page comparison with the original PDF (the unchecked criteria)

Goal: A signed-in user opens a converted PDF from the dashboard and reads it as a flipbook with realistic page turns. This is a private preview for the owner of the flipbook; public viewing by slug comes with publishing.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] Dashboard: each Ready flipbook has an Open action that goes to /flipbooks/:id (protected route; signed-out users are sent to /login)
- [x] Dashboard rows show filename · size · page count for Ready flipbooks (for example "ET Listing Presentation - Final 5.pdf · 3.2 MB · 20 pages · 10/15/2026"). Fixed after the first Milestone 5 report: the count was still rendered, but last on a single truncated line, so the Open button pushed it out of view. Size and count no longer shorten; only the filename and date do. The API now reports pageCount only for ready flipbooks (null while uploaded, processing or failed), so no misleading count can appear
- [x] GET /api/flipbooks/:id/pages requires a valid Firebase ID token and returns only the signed-in user's flipbook: its summary plus pages as { pageNumber, width, height }, sorted by pageNumber. Not-ready flipbooks return an empty page list. Another user's or a missing flipbook returns a structured 404
- [x] GET /api/flipbooks/:id/pages/:pageNumber/image returns one page image (image/webp, Cache-Control private) to the flipbook's owner only. The backend fetches it from Cloudinary with a signed URL built on the server; the browser never receives a Cloudinary URL, public ID or credential. Another user's flipbook, an unconverted flipbook, an invalid or missing page number all return the same structured 404. Cloudinary failure: structured 502. Cloudinary not configured: structured 503. Rate limited per user (1500 page requests per 15 minutes, structured 429)
- [x] Viewer uses react-pageflip with the Luxury Flip settings (900ms turn, soft shadows, cover shown alone), previous/next buttons, arrow keys, swipe/drag, and a page indicator (single page or spread, for example "2–3 / 20")
- [x] Page size comes from the stored page dimensions; two-page spread on wide screens, single page on narrow screens; the book re-fits when the window is resized and keeps the current page
- [x] Page images load through the authenticated API as blobs, nearest pages first (the open page and four either side, three requests at a time); a placeholder shows while a page loads and failed pages are retried when the reader moves
- [x] States: loading, "This flipbook doesn't exist or has been removed." (404), "This flipbook is being prepared. Please check back shortly." (processing, polled every 3 seconds until it settles), conversion failed (reason shown, retry from the dashboard), not converted yet, no pages, and "Something went wrong. Please try again." with a Try again button
- [x] Automated tests: npm test in backend (40 passing) covers the page list, ordering, absence of Cloudinary details, ownership 404s, not-ready flipbooks, invalid page numbers, image delivery, Cloudinary failure, missing configuration and the page count being reported only for ready flipbooks. npm test in frontend (6 passing, Node's built-in runner, no new dependency) covers the viewer layout rules: spread or single page on desktop and phone, portrait and landscape pages fitting the stage, a stage too small for the book, the page indicator and the end-of-book check for even and odd page counts. Frontend lint, production build and node --check on every backend file pass
- [x] Checked in a desktop browser (Chrome, signed in) with the existing 20-page brochure: all 20 pages load, cover shown alone, spread 2–3 after the first turn, last page reached with keyboard navigation and Next disabled at the end, no console errors, no request from the browser to Cloudinary, and a random flipbook ID shows the not-found message. Requests without a valid token return 401. A 390px-wide view showed a single page with controls and no horizontal scroll
- [x] Re-checked in Chrome on desktop after the page-count fix: both dashboard rows show their page count; the brochure opens with the right title; page order on screen read from the DOM is 1, then 2 | 3, then 4 | 5 (left | right), back to 2 | 3 and 1, with Previous disabled on page 1 and Next disabled on page 20; the one-page résumé opens as "1 / 1" with both buttons disabled; no console errors
- [ ] Owner check: open the 20-page brochure and compare each page with the original PDF. The viewer shows pages in the stored order (checked above); whether that order matches the PDF's content has not been checked by eye
- [ ] A landscape PDF opened in the browser. Only the layout rules are tested for landscape pages; no landscape PDF has been converted yet
- [ ] Owner check on a real phone (PROJECT.md requires a real mobile device before viewer work is marked complete): swipe turns, page indicator, loading speed
- [ ] Viewer load speed on mobile measured with a realistic brochure (see REFERENCE.md, PDF processing pipeline)

Environment: no new variables.

What is NOT part of this milestone:
- The other three flip styles and the style picker (Milestone 7)
- Public viewer at /view/[slug], publishing, sharing, making page images public (later milestones)
- Zoom, fullscreen, thumbnails, branding, CTA, download toggle, embed code (later milestones)
- Analytics (Milestone 10), deleting flipbooks (Milestone 8, see above), OG image (Milestone 13), billing

---

## Milestone 4: PDF conversion

Performance pass and live progress (October 2026, after Milestone 6; not a separate milestone):
- [x] Conversion of the real 20-page brochure went from 37.1s to 14.4-17.7s locally (same PDF, same machine, real Cloudinary and Atlas), with byte-identical page images. The bottleneck was uploading pages to Cloudinary one at a time, then a needless PNG step before WebP encoding. Up to 3 pages are now in flight. Details: REFERENCE.md, "PDF processing pipeline"
- [x] Dashboard shows real progress for each processing flipbook: stage (Waiting to start, Preparing PDF, Converting pages, Finalizing flipbook), a progress bar and percentage, and "N of M pages processed", from data the server records as pages are stored. 100% and Ready only when the flipbook is Ready; progress resumes after a reload; polling stops when conversion ends. The upload card shows the original upload as "Uploading original PDF… N%" (real bytes sent), then "Storing your PDF securely…"
- [x] Tests: concurrency limit, out-of-order completion stored in page order, progress counted only after upload and never above the total, cleanup only after in-flight uploads settle, timeout stops new pages, a failed progress write does not change the outcome, a new attempt resets progress, the summary percentage stays below 100, the dashboard poller (one round at a time, stops cleanly, retries failures)
- [x] Browser check (Chrome) with a temporary flipbook in the owner's account (removed afterwards): progress went Waiting to start, Preparing PDF, then Converting pages 0, 4, 9, 16 of 20, then Ready with 20 pages; the success toast appeared once and polling stopped
- [x] End-to-end timing from clicking Upload to Ready on the dashboard (same 20-page PDF, real browser upload): 22.3s before, 18.1-19.5s after starting conversion with the upload (using the bytes already in memory instead of downloading them again) and polling every second. The earlier 14-18s figure measured conversion only; upload, the separate convert request, the download and polling made up the rest
- [ ] Measure on Railway after deployment (total time, memory with 3 pages in flight)
- [ ] Owner check: a failed conversion shows the error and Retry without a progress bar (covered by tests; not seen in the browser)

Status: Implemented and in use; two owner checks still open (the last two unchecked criteria). Verified again in Milestone 5: the existing 20-page record stores pages 1-20 in sequence with every field the viewer needs (number, public ID, version, format, width, height), its page images are WebP, a signed server-side fetch returns them, and an unsigned URL returns 401. Visual page order against the original PDF has not been checked yet (see Milestone 5).

Goal: Convert an uploaded PDF into ordered page images stored privately in Cloudinary, and save the page metadata the viewer (Milestone 5) needs.

Acceptance criteria ([x] = verified, [ ] = not yet verified):
- [x] POST /api/flipbooks/:id/convert requires a valid Firebase ID token and converts only the signed-in user's flipbook; another user's or a missing flipbook returns a structured 404
- [x] The flipbook is claimed atomically (uploaded or failed -> processing). A second request while processing, or after it is ready, returns a structured 409; nothing runs twice
- [x] Conversion runs in the background (202 response) in a worker thread, one conversion at a time, so it never blocks the Express event loop; the dashboard polls GET /api/flipbooks/:id
- [x] The original is read back from Cloudinary through the authenticated API, checked again for the PDF signature and the 50MB limit, and refused if password protected or unreadable
- [x] Page limit by plan, read from MongoDB: free and starter 100 pages, pro 200. A PDF over the limit fails before any page is stored, with a clear message
- [x] Each page is rendered 1600px wide (no side over 4000px) as WebP and stored in Cloudinary as a private image (delivery type authenticated) under craftflip/users/<userId>/flipbooks/<flipbookId>/pages/<attemptId>/page-NNN
- [x] On success the flipbook stores status ready, pageCount and the ordered pages (pageNumber, Cloudinary public ID and version, format, width, height, bytes)
- [x] On failure the flipbook stores status failed with a user-facing reason, and page images already stored for that attempt are deleted. The original PDF is kept so the user can retry
- [x] Conversions interrupted by a server restart are marked failed on startup and their partial images removed
- [x] Conversion requests are rate limited per user (structured 429); a full queue returns a structured 503
- [x] API responses never include Cloudinary public IDs, URLs, credentials or server paths
- [x] Dashboard: conversion starts automatically after upload; Convert and Retry buttons; status, page count and failure reason shown
- [x] Automated tests (npm test in backend) cover rendering, ordering, page limit, cleanup, ownership, duplicate requests and restart recovery. Live check against the real Cloudinary and MongoDB: a 3-page PDF converted and stored privately (public URL 404, unsigned URL 401, signed URL 200), then the verification record and its assets were removed
- [ ] Owner check in the browser: upload a realistic 30-50 page brochure, confirm it reaches Ready with the right page count, and note the conversion time and the page image quality in the Cloudinary Media Library
- [ ] Conversion confirmed working on Railway (Milestone 14 deploy, or an earlier test deploy)

Environment: no new variables.

What is NOT part of this milestone:
- Flipbook viewer and page image delivery (Milestone 5)
- Publishing, making page images public, sharing (later milestones)
- OG image (Milestone 13), deleting flipbooks (Milestone 8), billing

---

## Completed milestones

**Milestone 3: PDF upload to Cloudinary** — Complete (October 2026)

Goal: A signed-in user uploads a PDF from the dashboard. The backend validates it, stores the original privately in Cloudinary, and records it in MongoDB as a Flipbook owned by that user.

Acceptance criteria (all verified October 2026 by the automated tests in backend/tests, run with npm test, plus a real signed-in browser upload):
- [x] POST /api/flipbooks (multipart/form-data, file field "pdf") requires a valid Firebase ID token; without one it returns a structured 401
- [x] Only PDF files are accepted: the file content must start with the PDF signature (%PDF-). The filename and declared MIME type are not trusted. Any other file, including a non-PDF renamed to .pdf, returns a structured 400
- [x] Maximum file size 50MB, enforced in the Multer config and checked again in the controller; larger files return a structured 413
- [x] Uploads are held in memory (Multer memory storage); nothing is written to the server's disk
- [x] The original PDF is stored in Cloudinary as a private asset (resource_type raw, delivery type authenticated). Cloudinary URLs are never returned to the client (checked against the live account: the public URL returns 404, unsigned and signed delivery URLs return 401)
- [x] A Flipbook document stores ownerId (ObjectId reference to User), title, unique slug (see Slug rules), status, original file details and Cloudinary asset details, with createdAt and updatedAt. Indexes: slug (unique), ownerId, createdAt
- [x] New flipbooks get status "uploaded" (original stored, waiting for conversion). The statuses processing, ready and failed are reserved for page conversion in Milestone 4
- [x] If the Cloudinary upload fails, no Flipbook document is created. If saving the Flipbook fails after the Cloudinary upload, the uploaded asset is deleted so no orphaned asset remains
- [x] GET /api/flipbooks returns only the signed-in user's flipbooks. GET /api/flipbooks/:id returns a structured 404 for a flipbook the user does not own
- [x] Uploads are rate limited per user; over the limit returns a structured 429
- [x] If Cloudinary credentials are missing, the server still starts and uploads return a structured 503
- [x] Dashboard: a PDF upload control with upload progress, success and error toasts, and a list of the user's uploaded PDFs with their status
- [x] Verified with a real signed-in browser upload that reaches Cloudinary
- [x] No credentials or secrets are committed to Git

Known limit: the Cloudinary Free plan caps each file at 10 MB, below the 50MB product limit. PDFs between 10 and 50MB are refused by Cloudinary and get a structured 413. Accepting 50MB PDFs requires a Cloudinary plan with a larger per-file limit; see REFERENCE.md, "PDF upload and storage".

Environment:
- Backend: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in backend/.env (Railway variables in deployment)
- Frontend: no new variables

What is NOT part of this milestone:
- PDF-to-image conversion, page count limits (checked after conversion), OG image (Milestones 4 and 13)
- Flipbook viewer, publishing, sharing, slug editing
- Deleting or renaming flipbooks, full dashboard (Milestone 8)
- Free plan limit of 3 live flipbooks: enforced at publish since Milestone 6; deleting (Milestone 8, first part) or unpublishing frees a slot, so a user is never blocked without a way to free one
- Billing, templates, Facebook sign-in

---

**Milestone 2: Firebase Authentication** — Committed (e85bfb3, October 2026); email/password end-to-end check still pending

Goal: Users can sign in with Firebase on the frontend, the backend verifies their Firebase ID token with Firebase Admin SDK, and each authenticated user has a matching User document in MongoDB.

Acceptance criteria ([x] = verified, [ ] = not yet verified, [-] = deferred):
- [x] Google sign-in works on the frontend (verified October 2026: real Google account signed in, dashboard showed the profile from GET /api/auth/me)
- [ ] Email/Password sign-in works on the frontend (implemented; not yet tested end to end with a real account)
- [-] Facebook sign-in: DEFERRED by the owner until Meta credentials (Meta app ID and app secret, configured in the Firebase console) are available. Not implemented in Milestone 2; to be added once the credentials exist
- [x] The backend verifies Firebase ID tokens using Firebase Admin SDK
- [x] Authenticated users are created or retrieved in MongoDB (User document keyed by a unique, indexed firebaseUid; email optional; see Authentication model)
- [x] A protected GET /api/auth/me endpoint returns the authenticated user's profile
- [x] Protected API requests without a valid token return a structured 401 response: { "success": false, "message": "..." }
- [x] Axios attaches the current Firebase ID token to authenticated API requests
- [x] Firebase ID tokens are not manually stored in localStorage
- [x] Backend auth endpoints (/api/auth/*) are rate limited per client IP; requests over the limit return a structured 429 response: { "success": false, "message": "..." } (approach in REFERENCE.md, "Authentication rate limiting")
- [ ] No credentials or secrets are committed to Git (verified for the working tree: .env files and the service account key are gitignored and untracked; confirm again when committing)

Environment:
- Frontend: the six VITE_FIREBASE_* variables (public web config only, no secrets)
- Backend local development: backend/firebase-service-account.json (gitignored, never committed)
- Backend deployment (Railway): FIREBASE_SERVICE_ACCOUNT_JSON containing the service-account JSON as a single string

What is NOT part of this milestone:
- PDF uploads
- Flipbook viewer
- Dashboard beyond what is needed to confirm a signed-in user
- Paddle billing and plan changes (User.plan defaults to free)
- Welcome email via Resend

---

**Milestone 1: Project foundation** — Complete (October 2026)

Goal: Both servers running locally, MongoDB connected, folder structure in place, environment files configured.

Acceptance criteria (met):
- Frontend loads at http://localhost:5173 with no errors
- Backend responds at http://localhost:5000 with health check JSON (GET /api/health)
- MongoDB connection confirmed in backend terminal
- No secrets in any committed file
- Both .env.example files present with correct variable names

---

## Feature list

### V1 — Confirmed for launch

CONFIRMED:
- PDF upload (drag and drop, max 50MB per file)
- Page limit: max 100 pages on free plan, max 200 pages on paid plans
- PDF to flipbook conversion (approach: prototype first, see REFERENCE.md)
- Flipbook viewer with 4 flip styles (see Flip Styles section)
- Visual style picker in dashboard (premium UI, not a dropdown)
- Shareable hosted URL with custom slug
- Slug auto-generated from title, user-editable with rules (see Slug Rules section)
- Basic branding controls (logo upload, flipbook title, background theme)
- 4 to 5 preset background themes (manual selection) (built October 2026 as the reader background: four temporary presets, a custom colour or an uploaded image; see "Milestone 9 follow-up")
- Floating CTA button on viewer (custom label and URL) (built October 2026, bottom right of the reader; see "Milestone 9 follow-up")
- Download toggle (allow or block PDF download per flipbook)
- Embed code generator (iframe snippet)
- Analytics dashboard (views, unique visitors, countries, devices, traffic source)
- Analytics stored in own MongoDB collections (no third-party analytics services)
- OG image auto-generated from first PDF page for social sharing
- Premium branded loading state (not a generic spinner)
- Graceful error states on viewer (never blank page)
- Google login via Firebase
- Facebook login via Firebase
- Email and password login via Firebase
- Paddle for subscriptions and billing
- Transactional emails via Resend
- Free plan limit enforcement with upgrade prompt (no silent deletion)

PROPOSED (to validate after V1 foundation works):
- Auto background theme detection from PDF colors (likely V2)
- Sound effects on page turn (to test with real users first)

### V2 — After launch, based on user feedback

- Password protection per flipbook
- Lead capture form (name, email, phone before viewing)
- Replace PDF while keeping the same link
- Table of contents auto-generated from PDF bookmarks
- Page-level analytics (time spent per page)
- Auto background theme from PDF colors

### V3 — Growth phase

- Custom domain per flipbook
- QR code per flipbook
- Advanced analytics and engagement reports
- Team accounts

---

## Flip styles (V1)

Four styles, one core viewer engine, CSS and motion configuration per style.
Do NOT build four separate rendering systems.

1. Luxury Flip: realistic page turn, soft shadows, slow elegant motion. Default.
2. Clean Swipe: horizontal slide, fast, minimal, best on mobile.
3. Classic Book: stronger page curve, more tactile hardcover feel.
4. Editorial: fade transition, no flip animation, premium and quiet.

Style is changeable anytime after publishing without breaking the link.
Build one style working perfectly before implementing the others.

Status: all four implemented in Milestone 7 (see "Current milestone"). The picker lives in the owner's preview page.

---

## Pricing (proposed, not finalized — validate against real costs and demand)

Free:
- 3 flipbooks live
- CraftFlip branding shown on viewer
- Shareable link
- Basic view stats
- Max 50MB per PDF, max 100 pages

Starter ($5/month or $50/year):
- 10 flipbooks live
- No CraftFlip branding
- Full analytics dashboard
- Embed code, CTA button
- Max 50MB per PDF, max 100 pages
- Email support

Pro ($12/month or $120/year):
- Unlimited flipbooks
- Custom slug editing
- Password protection (V2)
- Priority support
- Max 50MB per PDF, max 200 pages

Free plan limit behavior: the limit counts published flipbooks and is checked when publishing, not when uploading (uploads are not limited by it). At the limit, publishing is refused with 403 and an upgrade prompt. Never delete anything silently. User can unpublish or delete a flipbook themselves to free a slot.

---

## Tech stack (CONFIRMED — do not change without explicit approval)

### Frontend
- React + Vite
- React Router DOM
- Tailwind CSS v3 + DaisyUI
- react-pageflip (StPageFlip wrapper)
- Firebase SDK (Google, Facebook, email/password auth)
- Axios
- React Hot Toast
- Lucide React

### Backend
- Node.js + Express
- MongoDB Atlas + Mongoose
- Firebase Admin SDK (token verification on every protected route)
- express-rate-limit (rate limiting on auth endpoints)
- Multer (file uploads)
- Cloudinary SDK (image storage and delivery)
- Paddle (subscriptions and billing)
- Resend (transactional emails)
- pdfjs-dist + @napi-rs/canvas + sharp (PDF conversion; approved by the owner in October 2026 in place of pdf2pic, see REFERENCE.md)

### Hosting
- Frontend: Vercel
- Backend: Railway
- Database: MongoDB Atlas (M0 free tier to start)
- File storage: Cloudinary (free tier to start)

Not in stack (do not introduce without approval):
Next.js, Clerk, Auth0, Prisma, GraphQL, tRPC, Cloudflare R2, AWS S3, SendGrid, Supabase

---

## Authentication model (CONFIRMED)

Three methods via Firebase: Google, Facebook, email/password.

Backend flow:
1. Firebase issues ID token after successful sign-in
2. Frontend sends token in Authorization header: Bearer [token]
3. Firebase Admin SDK verifies token on every protected route
4. Middleware looks up the User document by firebaseUid (creating it on first sign-in) and attaches the MongoDB user document to req.user
5. Routes check resource ownership before any data operation

User document in MongoDB stores:
- firebaseUid (required, unique, indexed) — maps Firebase identity to MongoDB record; the only identity key
- email (optional, not unique) — some providers, such as Facebook, may not return one
- displayName
- photoURL
- plan (free / starter / pro)
- paddleCustomerId
- createdAt, updatedAt

One Firebase user maps to exactly one MongoDB User document, found or created by firebaseUid. Users are never matched or merged by email, and V1 has no account linking. See REFERENCE.md, "User identity and account linking".

Flipbook ownership: flipbook model stores ownerId as a MongoDB ObjectId reference to the User document. Every protected flipbook operation verifies that the authenticated user's MongoDB _id matches the flipbook's ownerId.

Do NOT manually store Firebase ID tokens in localStorage.
Let Firebase SDK manage its own session persistence.

---

## Slug rules (CONFIRMED)

- Auto-generated from flipbook title on creation: lowercase, hyphens, no special characters
- Short random 4-character alphanumeric ID appended to prevent collisions
- Example: "Boutique Home Group Florida" becomes boutique-home-group-florida-x7k2
- Unique index on slug field in MongoDB
- Editable freely before first publish
- Editable after first publish only with explicit user confirmation that old link will break
- Title changes after first publish never automatically update the slug
- Slug and title are decoupled after first publish

---

## Analytics data model (CONFIRMED — own MongoDB collections)

Each viewer session event stores:
- flipbookId (MongoDB ObjectId reference)
- sessionId (first-party session identifier, not browser fingerprint)
- timestamp
- country (from IP geolocation, country level only)
- deviceType (mobile, tablet, desktop — from user agent)
- referrer (from HTTP Referer header)
- pagesViewed (array of page numbers)
- sessionDuration (seconds)

As built in Milestone 10 (see REFERENCE.md, "Analytics"): the session ID is a random first-party visitor ID plus a 30-minute session rule (one ViewSession per session); timestamp is startedAt and lastSeenAt (the duration is lastSeenAt minus startedAt, last activity only, so it is stored but not reported); the referrer is kept as its host only; country is not collected: the deployment has no trusted country header and IP geolocation is not used (decided October 2026; REFERENCE.md, "Analytics", "Visitor country"). Top countries are therefore not shown.

Aggregated per flipbook in dashboard:
- Total views
- Unique visitors (by sessionId)
- Top countries
- Device breakdown
- Traffic sources
- Most viewed pages

No browser fingerprinting. No third-party analytics scripts on viewer pages.
Analytics on viewer pages must not degrade loading performance.

---

## File access model (CONFIRMED)

Two explicit access paths:

Published content: page images for a published flipbook are accessible to anyone with the public viewer URL. These are served through Cloudinary delivery URLs. (Implemented in Milestone 6: served by the backend after a publication check on every request instead, because signed Cloudinary URLs on this account never expire and expose internal IDs; see REFERENCE.md, "Publishing and public sharing".)

Private/unpublished content: original PDFs and unpublished flipbook assets are not exposed through public URLs. Access is controlled through the backend.

Important: a hard-to-guess URL is not access control. Enforce the intended rules explicitly. Do not assume Cloudinary URLs can be hidden from viewers (a browser displaying an image reveals its URL). The original PDF file is never directly accessible to viewers.

---

## URL structure

Public viewer: flip.thecraftaxis.com/view/[slug]
Dashboard: flip.thecraftaxis.com/dashboard
Private preview of an own flipbook (signed in): flip.thecraftaxis.com/flipbooks/[id]
Login: flip.thecraftaxis.com/login
Landing page: flip.thecraftaxis.com

---

## Security requirements

- Firebase token verified on every protected API endpoint via middleware
- Ownership verified on every flipbook operation (ownerId match)
- PDF upload validation: check actual MIME type server-side, not just file extension
- File size and page count enforced server-side
- Paddle webhook signature verified before processing any subscription update
- Subscription status always checked server-side, never trusted from frontend
- No secrets in any VITE_ frontend environment variable
- No secrets committed to Git
- firebase-service-account.json never committed to Git
- Rate limiting on upload and auth endpoints
- Graceful error handling everywhere, no stack traces exposed to client

---

## Email events (Resend)

- Welcome email on first signup
- Upgrade confirmation when plan changes
- Payment failed notification

---

## OG and social preview

- First page of PDF rendered as image during upload processing
- Resized to 1200x630 using sharp
- Stored in Cloudinary
- Used as og:image, og:title, og:description meta tags on viewer page
- Makes shared links look professional on WhatsApp, LinkedIn, Instagram, email

---

## Loading and error states

Loading: CraftFlip branded screen with logo and subtle animation. Placeholder in V1, refined later.
Error states:
- Flipbook not found: "This flipbook doesn't exist or has been removed."
- Still processing: "This flipbook is being prepared. Please check back shortly."
- General error: "Something went wrong. Please try again."
Upload failure: user notified with retry option. Flipbook slot not consumed on failed upload.

---

## Development workflow

- Read this file at the start of every session
- Build and test one milestone at a time
- Never start the next milestone before the current one passes acceptance criteria
- Test on a real mobile device before marking any viewer work complete
- Git commit after every verified working milestone
- Never expose or commit secrets

---

## Product Decisions for the Future UI/UX Pass

Agreed direction (October 2026), recorded before Milestone 10. The functional parts (background setting with temporary presets, floating call to action, three-group dialog) were then implemented at the owner's request, see "Milestone 9 follow-up" under "Current milestone". What remains for the dedicated visual-design and UI/UX pass: the curated background collection, the button's final appearance, spacing, mobile behaviour and dismissibility, and the overall visual review described below.

### Reader customization

Keep as built in Milestone 9:
- Logo upload, replacement and removal
- Call-to-action button colour (primary colour)
- Call-to-action label and destination
- PDF download control
- Website embedding
- The four reader styles (Luxury Flip, Clean Swipe, Classic Book, Editorial)

Change (implemented October 2026): replace the top-bar colour (reader.accentColor) with reader background customization:
- A small set of background presets
- Custom background colours
- Optional user-uploaded background images, shown behind the brochure and filling the surrounding reader canvas without covering the pages, on desktop and mobile layouts

Initial presets are temporary placeholders for product development: a few free-to-use stock images (or similar free resources), bundled with the app. Check each asset's licence and attribution requirements before use. No third-party image API and no new dependency just for presets. The visual-design phase replaces them with a cohesive, curated collection.

Uploaded background images follow the existing logo rules (AGENTS.md, File upload rules): PNG, JPEG or WebP checked by bytes, re-encoded with sharp, private storage served through the API, never SVG or remote URLs.

### Call-to-action placement

Change (implemented October 2026): the call to action moves from the top bar to a compact floating button near the bottom-right corner of the reader viewport (as the V1 feature list intended). Its purpose is a meaningful next action: book a viewing, contact the business, request a quote, visit a website.

The implementation should:
- Stay visible while navigating pages, where appropriate
- Not cover brochure content or navigation controls
- Adapt to narrow screens and mobile safe areas
- Respect the existing enable/disable setting
- Keep the existing link validation (server and browser) and the safe new-tab behaviour (rel="noopener noreferrer nofollow")

Exact appearance, spacing, mobile behaviour and dismissibility are decided in the UI/UX pass.

### Customization dialog organization

Grouping of the Customize dialog (implemented October 2026; its visual design is for the UI/UX pass):
1. Appearance: logo, background, brand colour, reader style
2. Actions: call-to-action label, destination, visibility, placement
3. Reader settings: PDF downloads, website embedding

### Plan restrictions

Keep everything compatible with future Free, Starter and Pro restrictions (gated by the plan read from MongoDB, Milestone 11). No new plan restrictions and no billing work come from these decisions.

### Development strategy

Finish the core functionality first (the numbered roadmap below), then run a dedicated visual-design and UI/UX pass that reviews, as one product: the dashboard, the customization experience, all four reader styles, backgrounds, CTA placement, mobile behaviour, loading states, and empty and error states. Do not interrupt the functional roadmap to implement these visual changes. The pass is not yet a numbered milestone; when it is scheduled, it gets a number without renumbering existing milestones.

---

## Roadmap (milestones)

Milestone numbers are the single numbering used across all project documents. Each service account (Firebase, Cloudinary, Paddle, Resend) is created in the milestone that first needs it.

1. Project foundation: folder structure, both servers running locally, MongoDB connected (complete)
2. Firebase Authentication: Google + email/password (committed; email/password check pending). Facebook sign-in deferred until Meta credentials are available
3. PDF upload to Cloudinary working (complete)
4. PDF conversion prototype and validation (implemented; owner checks pending)
5. Flipbook viewer with Luxury Flip style (first style only) (implemented; owner checks pending)
6. Publishing and public sharing (implemented, owner checks pending)
7. Remaining three flip styles and visual style picker (implemented, owner checks pending)
8. Dashboard and flipbook management (implemented including secure deletion, owner checks pending)
9. Branding controls, CTA button, reader settings and embed code (implemented, owner checks pending; follow-up with reader backgrounds and the floating CTA implemented, owner checks pending)
10. Analytics tracking and dashboard (implemented, owner checks pending; visitor country deferred)
11. Paddle subscription integration (postponed October 2026: Paddle account setup blocked; built after its account is approved)
12. Email notifications via Resend (current; implemented ahead of 11, waiting for Resend account setup and the owner's delivery check; upgrade and payment emails prepared, connected in 11)
13. OG image generation
14. Deploy to flip.thecraftaxis.com

Not yet numbered: the visual-design and UI/UX pass, after the core functionality (see "Product Decisions for the Future UI/UX Pass").

