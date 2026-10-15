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
Status: Foundation not yet built. Starting fresh October 2026.

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

**Milestone 1: Project foundation**

Status: Not started

Goal: Both servers running locally, MongoDB connected, folder structure in place, environment files configured.

Acceptance criteria:
- Frontend loads at http://localhost:5173 with no errors
- Backend responds at http://localhost:5000 with health check JSON
- MongoDB connection confirmed in backend terminal
- No secrets in any committed file
- Both .env.example files present with correct variable names

What is NOT part of this milestone:
- Authentication
- PDF uploads
- Flipbook viewer
- Dashboard
- Any UI beyond the default Vite React page

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
4. Middleware attaches decoded user to req.user
5. Routes check resource ownership before any data operation

User document in MongoDB stores:
- firebaseUid (unique, indexed) — maps Firebase identity to MongoDB record
- email
- displayName
- photoURL
- plan (free / starter / pro)
- paddleCustomerId
- createdAt, updatedAt

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

## Build order

1. Project files and folder structure (current)
2. Frontend and backend foundation running locally
3. MongoDB, Cloudinary, Firebase, Resend, Paddle accounts created
4. Auth working end to end (Google + Facebook + email/password)
5. PDF upload to Cloudinary working
6. PDF conversion prototype and validation
7. Flipbook viewer with Luxury Flip style (first style only)
8. Remaining three flip styles and visual style picker
9. Dashboard and flipbook management
10. Analytics tracking and dashboard
11. Branding controls, CTA button, embed code
12. Paddle subscription integration
13. Email notifications via Resend
14. OG image generation
15. Deploy to flip.thecraftaxis.com
