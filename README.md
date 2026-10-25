# CraftFlip

Premium PDF-to-flipbook platform by The CraftAxis.
Live at: flip.thecraftaxis.com

---

## Getting started

Milestones 1 and 3 are complete, Milestone 2 is committed, and Milestones 4 (PDF conversion), 5 (first flipbook viewer), 6 (publishing and public sharing), 7 (four flip styles), 8 (dashboard and flipbook management), 9 (branding, call to action, downloads, embed), 10 (analytics), 12 (transactional email) and 13 (social preview images) are implemented with owner checks pending; Milestone 11 (billing) is postponed. See PROJECT.md for the exact status.
To run what exists now you need Node.js, Git, a MongoDB Atlas connection, a Firebase project and a Cloudinary account. Resend is optional locally: without a key, emails are skipped and logged.
Do not set up Paddle yet.
Add each service's credentials only when that feature is being built.

---

## Prerequisites

Install these on your computer before anything else.

**Node.js 22.13 or higher**
Required by firebase-admin 14 (Node 22+), Vite 8, Mongoose 9 and pdfjs-dist 6 (PDF conversion, Node 22.13+). Download from https://nodejs.org (LTS version)

**Git**
Download from https://git-scm.com

PDF conversion (Milestone 4) needs no system programs: pdfjs-dist, @napi-rs/canvas and sharp install with `npm install` and ship prebuilt binaries for Windows, macOS and Linux (Railway).

Confirm installations:
```bash
node --version
npm --version
git --version
```

---

## Milestone 1: Run both servers locally

The frontend and backend are already scaffolded in this repository. Dependencies are declared in each `package.json`, so `npm install` is all that is needed. Packages for later milestones (for example `multer`, `cloudinary`) are added in the milestone that needs them, not up front.

### Step 1: Clone the repository

```bash
git clone https://github.com/admincraftflip/craftflip-website.git
cd craftflip-website
```

### Step 2: Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Tailwind CSS v3 and DaisyUI are already configured in `frontend/tailwind.config.js` and `frontend/postcss.config.js`. The `VITE_FIREBASE_*` values in `frontend/.env` can stay empty until Milestone 2.

Confirm: http://localhost:5173 loads with no errors.

### Step 3: Run the backend

Open a new terminal:
```bash
cd backend
npm install
cp .env.example .env
```

Fill in `MONGODB_URI` in `backend/.env`. If the connection string does not name a database, the backend uses the `craftflip` database. Other values can stay empty until their milestone.

Start the backend (uses nodemon):
```bash
npm run dev
```

Confirm:
- Terminal shows: `Server running on port 5000`
- Terminal shows: `MongoDB connected (database: craftflip)`
- http://localhost:5000/ returns: `{ "success": true, "message": "CraftFlip API is running" }`
- http://localhost:5000/api/health returns: `{ "success": true, "data": { "status": "ok", "database": "connected" } }`

**Milestone 1 is complete when both servers run with no errors and /api/health reports the database as connected.**

### Checks

```bash
cd backend && npm test              # backend tests (Node's built-in test runner; no services needed)
cd frontend && npm test && npm run lint && npm run build   # frontend tests (Node's built-in test runner), including the link preview function and vercel.json rule
```

Expected as of October 25, 2026: backend 249 passing, frontend 105 passing, lint and build without errors. If backend HTTP tests fail at random with "fetch failed", see REFERENCE.md, "Social previews (Milestone 13)", Test setup: the test server helper skips ports fetch refuses, and the 50 MB rejection test uses its own server.

---

## Required service accounts (add credentials as you reach each milestone)

### Milestone 1
**MongoDB Atlas** — https://mongodb.com/atlas
- Create free M0 cluster
- Create database user with password
- Add your current IP to network access (not "allow from anywhere")
- Copy connection string into MONGODB_URI in backend/.env

### Milestone 2 (authentication)
**Firebase** — https://firebase.google.com
- Create project named craftflip-website
- Authentication: enable Google and Email/Password
- Facebook sign-in is deferred until Meta credentials (app ID and app secret) are available; it is not implemented yet
- Authentication > Settings > Authorized domains: confirm localhost and add flip.thecraftaxis.com
- Project Settings > General > add web app > copy firebaseConfig into frontend/.env
- Project Settings > Service Accounts > generate private key > rename to firebase-service-account.json
- Place firebase-service-account.json in backend/ folder (never commit this file)
- For deployment, put the same JSON (as one line) in FIREBASE_SERVICE_ACCOUNT_JSON in the Railway dashboard, never in a committed file
- The service account must belong to the same Firebase project as the VITE_FIREBASE_* web config, or token verification fails
- Restart the backend: it logs `Firebase Admin initialized (project: ..., source: ...)`. Without credentials it logs `Firebase Admin not configured` and protected routes return 503
- Test: register at http://localhost:5173/register; /dashboard should show your account loaded from GET /api/auth/me

### Milestone 3 (PDF upload)
**Cloudinary** — https://cloudinary.com
- Create free account
- Copy Cloud Name, API Key, API Secret into backend/.env as CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (Cloudinary console > Settings > API Keys)
- Restart the backend: it logs `Cloudinary configured (cloud: ...)`. Without credentials it logs `Cloudinary not configured` and uploads return 503
- Test: sign in, upload a PDF on /dashboard, and confirm it appears in the list with status Uploaded and in the Cloudinary Media Library under craftflip/users/
- The Cloudinary Free plan accepts files up to 10 MB only; larger PDFs are refused with a 413 until the plan allows larger files

### Milestone 4 (PDF conversion)
No new accounts or environment variables. After `npm install` in backend/:
- While a PDF converts, its row shows the stage, a progress bar with the percentage, and how many pages are done; the page can be closed and reopened
- Upload a PDF on /dashboard. Conversion starts on the server with the upload: the status goes Processing, then Ready with the page count (or Failed with a reason and a Retry button)
- Page images appear in the Cloudinary Media Library under craftflip/users/<user>/flipbooks/<flipbook>/pages/ as private (authenticated) WebP images

### Milestone 5 (flipbook viewer)
No new accounts or environment variables.
- On /dashboard, a Ready flipbook has an Open button. It opens /flipbooks/<id>: the converted pages as a flipbook (Previous/Next buttons, arrow keys, or drag a page corner)
- Page images come through the backend (GET /api/flipbooks/:id/pages/:pageNumber/image); the browser never loads them from Cloudinary directly
- To check on a phone, open the Vite dev server from the phone on the same network (npm run dev -- --host) with VITE_API_BASE_URL and CLIENT_URL pointing at the PC's LAN address, and add that address to Firebase Authorized domains; or check after the first deploy

### Milestone 6 (publishing and public sharing)
No new accounts, packages or environment variables. MongoDB gets a new collection, publishedslugs, created automatically.
- On /dashboard, a Ready row shows Publish. Once published it shows the link (/view/<slug>), Copy link and Unpublish. Free plan: 3 published at a time ("N of 3 published")
- Anyone can open http://localhost:5173/view/<slug> without signing in while the flipbook is published. Unpublishing or deleting it makes the link show "This flipbook doesn't exist or has been removed."
- To check: publish a flipbook, copy the link, open it in a private window, flip pages, unpublish, reload the link
- Deployment: frontend/vercel.json rewrites every path to index.html (so /view/*, /dashboard and /flipbooks/* load on refresh) and sends X-Robots-Tag noindex for /view/*. Check both after the first Vercel deploy

### Milestone 7 (flip styles)
No new accounts, packages or environment variables.
- Open a Ready flipbook from /dashboard. Above the viewer, choose Luxury Flip, Clean Swipe, Classic Book or Editorial: the viewer switches at once and the choice is saved for that flipbook
- The public link (/view/<slug>) opens in the saved style; no republishing is needed. Existing flipbooks use Luxury Flip until changed

### Milestone 9 (branding, call to action, downloads, embed)
No new accounts, packages or environment variables.
- Open a Ready flipbook and choose Customize (or the sliders icon on its dashboard row). Appearance: upload a logo (PNG, JPEG or WebP, up to 2 MB), choose the reader background (default, a colour, one of four temporary preset images, or your own PNG, JPEG or WebP up to 8 MB; images are softened behind the pages) and the button colour. The viewing style is chosen in the bar at the top of the preview. Actions: the call-to-action button, which floats at the bottom right of the reader. Reader settings: allow or block PDF downloads, and copy the embed code once the flipbook is published
- The preset images are CC0 placeholders in frontend/public/reader-backgrounds (sources in CREDITS.md there); they are bundled with the frontend, so nothing needs configuring
- The public link and the embed (/embed/<slug>) show the saved settings. Embeds work only while the flipbook is published
- Embedding on other sites needs the Vercel headers in frontend/vercel.json (only /embed/* may be framed); check them after deployment

### Milestone 8 (dashboard and flipbook management)
No new accounts, packages or environment variables.
- Each row: Open, the pencil (edit title and public link), the style name (opens the preview to change it), Publish/Unpublish, Copy link, Convert/Retry, Delete
- Changing the link of a flipbook that has been published needs a confirmation: the old link stops working for good and is never reused
- If the list or account cannot load, use Try again instead of reloading the page

### Milestone 8, first part (flipbook deletion)
No new accounts or environment variables.
- On /dashboard, each row has a Delete (bin) button. Confirm in the dialog; the row disappears and the flipbook's original PDF and page images are removed from Cloudinary
- Deleting is disabled while a PDF is converting. If Cloudinary cleanup fails, the row stays as "Not fully deleted"; delete it again to retry
- To check: upload a throwaway PDF, wait for Ready, delete it, then confirm its folder under craftflip/users/ in the Cloudinary Media Library has no files (an empty folder may remain)

### Milestone 10 (analytics)
No new accounts, packages or environment variables. MongoDB creates the viewsessions collection and its indexes on the first recorded visit.
- The dashboard's Analytics section shows views, unique visitors, pages per view, views over time, devices, sources and each flipbook's figures for 7, 30 or 90 days or all time
- Visits are counted from public links and embeds only. To see your own test visits counted, use a browser where you have not opened the dashboard (your own browser is left out on purpose)
- Country is not collected: the deployment has no trusted country header (see REFERENCE.md, Analytics, Visitor country)

### Milestone 11 (billing, postponed)
**Paddle** — https://paddle.com
- Postponed: Paddle account setup is blocked. Not built yet
- Confirm account approval for Bangladesh before building payment features
- Copy API key and webhook secret into backend/.env

### Milestone 12 (emails)
No new packages. Without a key everything works and emails are skipped (the backend logs `Resend not configured: missing RESEND_API_KEY (emails are skipped)`). Tests never need Resend.

**Resend** — https://resend.com (only needed to actually deliver email)
- Create a free account
- Domains > Add domain: flip.thecraftaxis.com (the sender is `CraftFlip <hello@flip.thecraftaxis.com>`, set in backend/config/resend.js). Add the DNS records Resend shows at the domain's DNS provider and wait until the domain is Verified. Until then Resend refuses to send (logged as `HTTP 403 validation_error`)
- API Keys > Create API key with "Sending access" only. Put it in backend/.env as RESEND_API_KEY (and later in the Railway variables). Never commit it; never put it in a VITE_ variable
- Restart the backend: it logs `Resend configured`
- Test: sign up with a new account (a new Google account or a new email/password). The backend logs `Email sent (template: welcome, id: ...)` and the welcome email arrives; signing in again sends nothing. Accounts that existed before Milestone 12 never get a welcome email
- The upgrade confirmation and payment failure emails are prepared but sent by nothing until billing (Milestone 11)
- If delivery fails the backend logs `Email delivery failed (template: welcome): HTTP <status> <name>: <Resend's message>` (addresses, the subject and the key are replaced by `[address]`/`[redacted]`). Common 403s: `validation_error: The flip.thecraftaxis.com domain is not verified` (verify exactly that domain in Resend), `validation_error: You can only send testing emails to your own email address` (no verified domain on this account), `restricted_api_key` (key not active), and `cloudflare_1010` (blocked before Resend, usually the User-Agent header)

### Milestone 13 (social preview images)
Status: the local implementation and automated checks are complete (backend 249, frontend 105 passing, lint and build pass, at the time; 257 and 111 after the table of contents follow-up below). Not yet verified: a real preview image generated and stored in Cloudinary, the Vercel rewrite and function on a live deployment, and real previews in Facebook, LinkedIn, WhatsApp and X. The steps below cover them.

No new accounts, packages or environment variables. The Vercel function reads the existing VITE_API_BASE_URL, which must be set for the Production environment in Vercel (it already is, for the build).
- A converted flipbook gets a 1200x630 preview image of its first page a moment after it becomes Ready. Older flipbooks get one when published or when their public link is first opened
- The image is in the Cloudinary Media Library under craftflip/users/<user>/flipbooks/<flipbook>/social/ as a private (authenticated) image
- Check the image locally: publish a flipbook, open its public link once, wait a few seconds, then open http://localhost:5000/api/public/flipbooks/<slug>/social-image in the browser
- Check the tags locally (no Vercel needed), with the backend running:
  ```bash
  cd frontend
  npm run build
  npm run preview:social
  # in another terminal (Git Bash; in PowerShell use curl.exe):
  curl -A "facebookexternalhit/1.1" http://localhost:4173/view/<slug>
  ```
  The output contains og:title, og:image and twitter:card for the flipbook; the og:image address opens the image. Without the -A option (or in a browser) the normal app is returned. Unpublish the flipbook and repeat: 404 and only the generic CraftFlip tags. Locally the addresses are http; on Vercel they are https
- Deploy the backend (Railway) before or together with the frontend: until the backend has the image route, links get the small card without an image (safe, just plainer)
- First check after deployment: `curl -A "facebookexternalhit/1.1" https://flip.thecraftaxis.com/view/<published slug>` must show og:title and og:image for that flipbook, and the og:image address must open the image. If only the generic CraftFlip tags appear, check in Vercel that VITE_API_BASE_URL is set for the Production environment (the function reads it at runtime) and look at the api/view function's logs; `curl` without -A must still return the normal app
- After deployment: paste a published link into https://developers.facebook.com/tools/debug/ and https://www.linkedin.com/post-inspector/, and send it in a WhatsApp chat. Apps cache previews; the Facebook and LinkedIn tools refresh them

### Table of contents (unnumbered follow-up, October 2026)
No new accounts, packages, environment variables or migrations. Existing flipbooks simply have no contents.
- Open a Ready flipbook and choose Customize. Under Reader settings, Contents: Add section, type a title (up to 80 characters) and the page it starts on, up to 50 sections. Save settings; the sections are sorted by page
- The reader (preview, public link and embed, every style) then shows a Contents button at the left of the toolbar. It opens a list beside the book on wide screens and over the reader on phones; choosing a section goes to its page. Remove every section to hide the button
- Owner check: add contents to one of your flipbooks, then try the button on a computer and a real phone (including a 320px-wide phone, where the Contents button replaces the fullscreen button)

---

## Environment variable reference

### frontend/.env.example
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE_URL=http://localhost:5000
```

### backend/.env.example
```
PORT=5000
MONGODB_URI=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
RESEND_API_KEY=
CLIENT_URL=http://localhost:5173
# Firebase Admin credentials for deployment (Railway): paste the full service-account JSON as one line.
# Leave empty for local development; use backend/firebase-service-account.json instead. Never commit a real value.
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Never commit .env files.
Never commit firebase-service-account.json.
Both are in .gitignore.

---

## Project structure

```
craftflip/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── utils/
│       ├── context/
│       ├── firebase.js
│       └── App.jsx
├── backend/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── config/
│   ├── firebase-service-account.json  (never commit)
│   ├── .env                           (never commit)
│   └── server.js
├── PROJECT.md
├── AGENTS.md
├── README.md
└── REFERENCE.md
```

---

## Deployment (when ready)

Frontend: deploy to Vercel, connect GitHub repo, add VITE_ environment variables in Vercel dashboard.
Backend: deploy to Railway, connect GitHub repo, add backend environment variables in Railway dashboard. Add firebase-service-account.json contents as the FIREBASE_SERVICE_ACCOUNT_JSON environment variable (JSON string).
Domain: point flip.thecraftaxis.com to Vercel deployment via DNS CNAME record.
