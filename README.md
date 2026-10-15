# CraftFlip

Premium PDF-to-flipbook platform by The CraftAxis.
Live at: flip.thecraftaxis.com

---

## Getting started (Milestone 1 only)

For the first milestone you only need Node.js, Git, and a MongoDB Atlas connection.
Do not set up Cloudinary, Firebase, Paddle, or Resend yet.
Add each service's credentials only when that feature is being built.

---

## Prerequisites

Install these on your computer before anything else.

**Node.js 18 or higher**
Download from https://nodejs.org (LTS version)

**Git**
Download from https://git-scm.com

**Ghostscript** (required later for PDF conversion, not needed for Milestone 1)
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

### Step 1: Create the project folder

```bash
mkdir craftflip
cd craftflip
```

Place PROJECT.md, AGENTS.md, README.md, and REFERENCE.md in this folder.

### Step 2: Set up the frontend

```bash
mkdir frontend
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom axios firebase react-hot-toast lucide-react react-pageflip
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install daisyui
```

Configure Tailwind. Replace `frontend/tailwind.config.js` with:
```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ["light", "dark"],
  },
}
```

Replace `frontend/src/index.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `frontend/.env` (copy from `frontend/.env.example`, fill in values later):
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE_URL=http://localhost:5000
```

Start the frontend:
```bash
npm run dev
```

Confirm: http://localhost:5173 loads with no errors.

### Step 3: Set up the backend

Open a new terminal tab:
```bash
cd ../backend
npm init -y
npm install express mongoose dotenv cors multer cloudinary firebase-admin paddle-billing resend pdf2pic sharp
npm install -D nodemon
```

Add to `backend/package.json`:
```json
"type": "module",
"scripts": {
  "dev": "nodemon server.js",
  "start": "node server.js"
}
```

Create folder structure:
```bash
mkdir controllers middleware models routes utils config
```

Create `backend/.env` (copy from `backend/.env.example`, fill in MongoDB URI now):
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
```

Create `backend/server.js`:
```js
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(express.json())

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err))

app.get('/', (req, res) => {
  res.json({ success: true, message: 'CraftFlip API is running' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

Start the backend:
```bash
npm run dev
```

Confirm:
- Terminal shows: `Server running on port 5000`
- Terminal shows: `MongoDB connected`
- http://localhost:5000 returns: `{ "success": true, "message": "CraftFlip API is running" }`

**Milestone 1 is complete when both servers run with no errors and MongoDB connects.**

---

## Required service accounts (add credentials as you reach each milestone)

### Milestone 1
**MongoDB Atlas** — https://mongodb.com/atlas
- Create free M0 cluster
- Create database user with password
- Add your current IP to network access (not "allow from anywhere")
- Copy connection string into MONGODB_URI in backend/.env

### Milestone 3 (authentication)
**Firebase** — https://firebase.google.com
- Create project named craftflip
- Authentication: enable Google, Facebook, Email/Password
- Project Settings > General > add web app > copy firebaseConfig into frontend/.env
- Project Settings > Service Accounts > generate private key > rename to firebase-service-account.json
- Place firebase-service-account.json in backend/ folder (never commit this file)

### Milestone 4 (file uploads)
**Cloudinary** — https://cloudinary.com
- Create free account
- Copy Cloud Name, API Key, API Secret into backend/.env

### Milestone 12 (billing)
**Paddle** — https://paddle.com
- Confirm account approval for Bangladesh before building payment features
- Copy API key and webhook secret into backend/.env

### Milestone 13 (emails)
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
