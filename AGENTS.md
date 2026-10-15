# AGENTS.md — Rules for AI Coding Agents

This file is for Claude Code, Codex, and any other AI coding assistant working on CraftFlip.
Read PROJECT.md and this file before touching anything in this project.
If any instruction here conflicts with PROJECT.md, stop and flag the conflict. Do not guess.

---

## What is this project?

CraftFlip is a premium PDF-to-flipbook SaaS platform.
Live at: flip.thecraftaxis.com
Owner: The CraftAxis agency, Dhaka, Bangladesh
Full details: read PROJECT.md before starting any task.

---

## Before you start any session

1. Read PROJECT.md in full
2. Read the Current Milestone section and confirm what you are building
3. Inspect existing files before creating or modifying anything
4. If the existing code conflicts with PROJECT.md, flag it before proceeding
5. Never assume files exist — verify them before referencing them

---

## The golden rules

1. Build only the current milestone. Never implement two milestones in one session.
2. Test what you build before reporting it as done. Do not claim something works without running it.
3. Never delete or overwrite a working file without explicit instruction.
4. Never commit secrets, API keys, credentials, or service account files.
5. If a decision conflicts with PROJECT.md, stop and ask. Do not guess or improvise architecture.
6. Report honestly. If something doesn't work, say so clearly.

---

## Tech stack (do not deviate without explicit approval)

Frontend: React + Vite, React Router DOM, Tailwind CSS v3, DaisyUI, Firebase SDK, Axios, react-pageflip, Lucide React, React Hot Toast.

Backend: Node.js + Express, MongoDB + Mongoose, Firebase Admin SDK, express-rate-limit, Multer, Cloudinary SDK, Paddle, Resend, pdf2pic, sharp.

Hosting: Vercel (frontend), Railway (backend).

Do NOT introduce without approval:
Next.js, Clerk, Auth0, Prisma, GraphQL, tRPC, Cloudflare R2, AWS S3, SendGrid, Supabase, or any technology not listed above.

---

## Folder structure

```
craftflip/
├── frontend/
│   └── src/
│       ├── components/       # Reusable UI components
│       ├── pages/            # Route-level page components
│       ├── hooks/            # Custom React hooks
│       ├── utils/            # Helper functions and Axios config
│       ├── context/          # React context providers
│       ├── firebase.js       # Firebase initialization only
│       └── App.jsx           # Router and layout
├── backend/
│   ├── controllers/          # Route handler logic
│   ├── middleware/           # Auth, error, validation middleware
│   ├── models/               # Mongoose schemas
│   ├── routes/               # Express route definitions
│   ├── utils/                # Helper functions
│   ├── config/               # Service configuration (Cloudinary, Resend, etc.)
│   ├── .env                  # Never commit this file
│   └── server.js             # Express app entry point
├── PROJECT.md
├── AGENTS.md
├── README.md
└── REFERENCE.md
```

---

## Environment variable names (use exactly these, no variations)

Frontend (.env):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_API_BASE_URL
```

Backend (.env):
```
PORT
MONGODB_URI
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
RESEND_API_KEY
CLIENT_URL
FIREBASE_SERVICE_ACCOUNT_JSON
```

FIREBASE_SERVICE_ACCOUNT_JSON holds the Firebase service-account JSON as a single string for deployment (Railway). Leave it empty locally and use backend/firebase-service-account.json instead. Never put a real value in .env.example or any committed file.

Never use variations like MONGO_URI, VITE_API_URL, or VITE_BACKEND_URL.
Never put secrets into VITE_ variables. They are exposed in the browser bundle.

---

## Coding standards

### General
- Use ES modules (import/export) everywhere, frontend and backend
- Use async/await, never raw .then() chains
- Always handle errors with try/catch
- Never expose stack traces or raw error messages to the client
- Use descriptive variable names, no single-letter abbreviations except loop counters
- Keep functions small and single-purpose
- No commented-out code in committed files

### Backend
- Every route that touches user data must use the auth verification middleware
- Every route that touches a flipbook must verify the requesting user owns it
- Validate file uploads server-side: check actual MIME type, not just file extension
- Enforce file size and page count limits server-side only
- All secrets via process.env — never hardcode values
- Always return structured JSON: { success: true, data: {} } or { success: false, message: "" }

### Frontend
- Do NOT manually store Firebase ID tokens in localStorage or sessionStorage
- Let Firebase SDK manage its own session persistence
- Never trust plan or subscription status from the frontend — always verify from backend API
- All API calls go through a central Axios instance in src/utils/api.js
- Firebase token attached to every authenticated request via Axios interceptor
- All user-visible errors shown via React Hot Toast

### MongoDB models
- Always include createdAt and updatedAt (use timestamps: true in Mongoose schema options)
- Use meaningful field names that match PROJECT.md data model exactly
- Index fields queried frequently: userId, slug, createdAt, firebaseUid
- Flipbook model uses ownerId as ObjectId reference to User model, not a raw Firebase UID

---

## Authentication rules

Three auth methods via Firebase: Google, Facebook, email/password.

On every protected backend route:
1. Extract token from Authorization header: Bearer [token]
2. Verify with Firebase Admin SDK: admin.auth().verifyIdToken(token)
3. Find the User document in MongoDB by firebaseUid, or create it on first sign-in (upsert on firebaseUid)
4. Attach MongoDB user document to req.user
5. Check ownerId on every resource operation

User identity: firebaseUid is the only identity key (required, unique). email is optional and not unique. Never match or merge users by email; there is no account linking in V1 (see REFERENCE.md).

Rate limiting: /api/auth/* routes are rate limited per client IP with express-rate-limit (backend/middleware/rateLimiter.js) and return a structured 429 when over the limit. Express trusts exactly one proxy hop; see REFERENCE.md before changing this.

Firebase credentials on backend:
- Use firebase-service-account.json for local development
- This file is in .gitignore and must never be committed
- On Railway: use environment variable FIREBASE_SERVICE_ACCOUNT_JSON containing the JSON string

---

## File upload rules

- Accept PDF files only
- Validate MIME type server-side (application/pdf) — do not trust the file extension
- Maximum file size: 50MB — enforce in Multer config and check again in controller
- Maximum pages: 100 free plan, 200 paid plans — check after conversion
- On successful upload: convert pages to images, store in Cloudinary, generate OG thumbnail
- On conversion failure: return clear error to user, do not consume their flipbook slot
- Never store the original PDF in MongoDB
- Never expose raw Cloudinary URLs as the only access control for private content

---

## Slug rules

- Auto-generate from flipbook title: lowercase, hyphens, no special characters, 4-char random ID appended
- Example: boutique-home-group-florida-x7k2
- Unique index on slug field
- Editable before first publish without warning
- Editable after first publish only with explicit warning returned from API
- Title changes never automatically change slug after first publish

---

## Subscription and plan rules

- Plan status always checked from MongoDB, never from frontend
- Free plan: maximum 3 flipbooks live — check before processing upload
- At limit: return 403 with clear error, frontend shows upgrade modal
- Never silently delete content
- Paddle webhooks verified by signature before any plan update is processed
- Plan updates only via verified Paddle webhook handler

---

## Analytics rules

- Track viewer sessions in MongoDB analytics collection
- Use a first-party session identifier (not browser fingerprinting)
- Collect: country from IP (country level only), device type from user agent, referrer from HTTP header
- Do not collect personally identifiable information from viewers
- Do not add third-party analytics scripts to the viewer page
- Analytics only visible to flipbook owner in their dashboard

---

## Error handling rules

Backend errors always return:
```json
{ "success": false, "message": "Human-readable message here" }
```

Never return stack traces, internal paths, or raw database errors to the client.

Frontend error states on viewer page (never blank or broken):
- Flipbook not found: "This flipbook doesn't exist or has been removed."
- Still processing: "This flipbook is being prepared. Please check back shortly."
- General error: "Something went wrong. Please try again."

---

## What NOT to build without explicit instruction

Do not add any of these in V1:
- Team accounts or workspaces
- Built-in PDF editor or design tool
- AI content generation
- Marketplace or public discovery feed
- Custom domain support (V3)
- QR codes (V3)
- Password protection (V2)
- Lead capture forms (V2)
- Sound effects (proposed, not confirmed)
- Auto theme detection from PDF colors (V2)

---

## How to report completed work

After completing any task, report all of:
1. Every file created or modified (full paths)
2. Commands the developer needs to run
3. Environment variables that need to be added to .env
4. What was tested and the actual result (not assumed)
5. Any decisions made that are not in PROJECT.md (flag these explicitly)
6. What the next step should be

Do not report a milestone complete unless every acceptance criterion in PROJECT.md is met.

---

## .gitignore requirements

The .gitignore must include at minimum:
```
node_modules/
.env
.env.local
*.env
firebase-service-account.json
dist/
build/
.DS_Store
```
