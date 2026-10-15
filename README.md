# CraftFlip

Premium PDF-to-flipbook platform by The CraftAxis.
Live at: flip.thecraftaxis.com

---

## Getting started

Milestone 1 (foundation) is complete. The current milestone is Milestone 2 (Firebase Authentication); see PROJECT.md.
For Milestones 1 and 2 you need Node.js, Git, a MongoDB Atlas connection, and a Firebase project.
Do not set up Cloudinary, Paddle, or Resend yet.
Add each service's credentials only when that feature is being built.

---

## Prerequisites

Install these on your computer before anything else.

**Node.js 22.12 or higher**
Required by firebase-admin 14 (Node 22+), Vite 8 and Mongoose 9. Download from https://nodejs.org (LTS version)

**Git**
Download from https://git-scm.com

**Ghostscript** (required later for PDF conversion in Milestone 4, not needed for Milestones 1–3)
- Windows: https://ghostscript.com/releases — download and install 64-bit version
- Mac: `brew install ghostscript`
- Linux/Railway: install via apt or confirm it is available on your deployment platform

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
- Copy Cloud Name, API Key, API Secret into backend/.env

### Milestone 10 (billing)
**Paddle** — https://paddle.com
- Confirm account approval for Bangladesh before building payment features
- Copy API key and webhook secret into backend/.env

### Milestone 11 (emails)
**Resend** — https://resend.com
- Create free account
- Copy API key into backend/.env

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
