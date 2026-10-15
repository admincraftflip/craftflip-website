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

## PDF processing pipeline — decision pending prototype

Status: CONFIRMED approach, prototype required before full implementation.

Two options were evaluated:

Option A: Render PDF pages directly in the browser using PDF.js.
Option B: Convert PDF pages to images server-side using pdf2pic and Ghostscript, store in Cloudinary, serve images in viewer.

Planned decision: Option B (server-side conversion).

Reasons for Option B:
- Large design-heavy real estate brochures (20-60 pages, high resolution) can be slow to render in the browser
- Client devices vary widely in performance
- Pre-rendered images load progressively and predictably
- Images served from Cloudinary CDN are fast globally
- Viewer becomes simpler: displays images only, no PDF engine in browser

Why a prototype is required first:
- We have not yet tested Option B against realistic brochure files
- Ghostscript availability on Railway needs verification
- Conversion time and Cloudinary costs need measurement with real files
- If Option B proves unnecessarily complex for typical file sizes, Option A is still available

Action: before implementing the full conversion pipeline, test pdf2pic with a real 30-50 page real estate brochure and measure: conversion time, output image quality, Cloudinary storage used per flipbook, viewer load speed on mobile.

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

---

## File access control

Two explicit tiers:

Published content: page images for published flipbooks are intentionally public. Served through Cloudinary delivery URLs accessible to anyone with the viewer link.

Private content: original PDF files and unpublished assets are not exposed publicly. Access controlled through backend.

Important clarifications:
- A hard-to-guess URL is not access control
- A browser displaying a Cloudinary image reveals its delivery URL in browser dev tools
- The original PDF is never directly accessible to viewers
- Unpublished flipbooks are not accessible via the viewer URL

---

## MongoDB indexes to create

Users collection:
- email: unique
- firebaseUid: unique

Flipbooks collection:
- slug: unique
- ownerId: index (for querying user's flipbooks)
- createdAt: index (for sorting)

Analytics events collection:
- flipbookId: index
- createdAt: index
- compound (flipbookId, createdAt): index (for dashboard time-range queries)

---

## Firebase Admin credentials on backend

Local development: use firebase-service-account.json in backend folder, loaded in config initialization. This file is in .gitignore and must never be committed.

Production on Railway: store the JSON content as environment variable FIREBASE_SERVICE_ACCOUNT_JSON. Parse it in the Firebase Admin initialization:
```js
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
```

---

## Decisions still pending

- Exact Paddle plan product IDs (after account approval)
- Final CraftFlip brand colors and typography
- Loading animation design (placeholder in V1, refined later)
- Email template designs for Resend
- Whether Ghostscript is available on Railway by default or requires installation step
- Cloudinary folder structure for organizing user assets
- Measurement of PDF conversion performance with realistic brochure files
