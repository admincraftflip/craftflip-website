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
Status: Milestones 1 and 3 complete. Milestone 2 (Firebase Authentication) committed; email/password check pending. Milestone 4 (PDF conversion) is next. Started October 2026.

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

**Milestone 4: PDF conversion**

Status: Not started

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
- PDF-to-image conversion, page count limits (checked after conversion), OG image (Milestones 4 and 12)
- Flipbook viewer, publishing, sharing, slug editing
- Deleting or renaming flipbooks, full dashboard (Milestone 7)
- Free plan limit of 3 live flipbooks: enforced once flipbooks can be published and deleted (Milestone 7), so a user is never blocked without a way to free a slot
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
- 4 to 5 preset background themes (manual selection)
- Floating CTA button on viewer (custom label and URL)
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

Free plan limit behavior: when user hits limit, block upload, show upgrade prompt. Never delete anything silently. User can delete an old flipbook themselves to free a slot.

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
- pdf2pic + sharp (PDF conversion — implement after prototype validation)

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

Published content: page images for a published flipbook are accessible to anyone with the public viewer URL. These are served through Cloudinary delivery URLs.

Private/unpublished content: original PDFs and unpublished flipbook assets are not exposed through public URLs. Access is controlled through the backend.

Important: a hard-to-guess URL is not access control. Enforce the intended rules explicitly. Do not assume Cloudinary URLs can be hidden from viewers (a browser displaying an image reveals its URL). The original PDF file is never directly accessible to viewers.

---

## URL structure

Public viewer: flip.thecraftaxis.com/view/[slug]
Dashboard: flip.thecraftaxis.com/dashboard
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

## Roadmap (milestones)

Milestone numbers are the single numbering used across all project documents. Each service account (Firebase, Cloudinary, Paddle, Resend) is created in the milestone that first needs it.

1. Project foundation: folder structure, both servers running locally, MongoDB connected (complete)
2. Firebase Authentication: Google + email/password (committed; email/password check pending). Facebook sign-in deferred until Meta credentials are available
3. PDF upload to Cloudinary working (complete)
4. PDF conversion prototype and validation (current)
5. Flipbook viewer with Luxury Flip style (first style only)
6. Remaining three flip styles and visual style picker
7. Dashboard and flipbook management
8. Analytics tracking and dashboard
9. Branding controls, CTA button, embed code
10. Paddle subscription integration
11. Email notifications via Resend
12. OG image generation
13. Deploy to flip.thecraftaxis.com
