# The Better Kids Clinic EMR — complete runnable bundle

Everything needed to run the kid EMR: the web app, its serverless API, Firebase
rules, chart assets/generators, config and the medication-catalog tools.

## Quick start (Windows)

1. Install **Node.js 20+** and **Python 3.10+** (both must be on PATH).
2. Double-click `setup.bat` (once) — installs Node + Python dependencies.
3. Double-click `start.bat` — opens http://localhost:5173/emr/kid/
4. Sign in with the clinic password from `emr/kid/.env` (`CLINIC_ACCESS_PASSWORD`).

Or from a terminal in this folder:

```bash
npm run setup
```

```bash
npm run dev
```

## What's in here

| Path | What it is |
| --- | --- |
| `emr/kid/` | The Vite web app (all pages, `lib/`, assets, fonts, icons, PWA files) |
| `emr/kid/.env` | Local config (clinic password, session secrets, Firebase admin creds path). **Do not commit.** |
| `emr/kid/.env.example` | Template listing every variable the app + API read |
| `emr/kid/api/` | Vercel functions served inside the app (`/api/growth_charts` Python, `/api/auth/*`) |
| `emr/kid/chart_plotting.py`, `growth_chart_config.json` | Growth-chart plotting engine + config |
| `emr/kid/scripts/render_growth_charts.py` | Local renderer the dev server calls for `/api/growth_charts` |
| `emr/portal-shared.css` | Shared portal CSS, synced into the app on every dev/build |
| `api/kid/` | Serverless API: `auth`, `otp`, `patients`, `portal`, `prescriptions`, `intake` |
| `api/_lib/`, `api/lungs/` | Shared OTP rate limiter, lungs Firebase admin (used by OTP lookup) |
| `middleware.js` | Root Vercel middleware — the production password gate for `/emr/kid` |
| `firebase/`, `firebase.json`, `.firebaserc` | Firestore / Storage / Realtime DB rules for project `clinci-dr-gunda` |
| `scripts/` | Shared-CSS sync + WHO/IAP chart image generators |
| `secrets/firebase-service-account.json` | Firebase Admin service account. **Secret — never commit or share.** |
| `tools/medication-catalog/` | Medication catalog CSV, draft, importer, `medication.json` |

## Local development notes

- `npm run dev` serves the app **and** the `api/kid/*` handlers locally (a dev
  bridge in `emr/kid/vite.config.js` routes `/api/kid/...` to the files in
  `api/kid/`), so patient creation, prescriptions, portal and OTP all work
  against the real Firestore project.
- Staff login (`/api/kid/auth/login`) is handled by the dev server using
  `CLINIC_ACCESS_PASSWORD`.
- Parent-portal OTP needs `MSG91_AUTH_KEY` / `MSG91_EXISTENCE_CHECK_SECRET` in `.env`.
- The browser Firebase config defaults to `clinci-dr-gunda`
  (`emr/kid/lib/firebase-init.js`); override with the `VITE_KID_FIREBASE_*` vars.

## Other commands

| Command | Does |
| --- | --- |
| `npm run build` | Production build into `emr/kid/dist` |
| `npm run preview` | Serve the built app |
| `npm run catalog:dry-run` | Show what the medication importer would write (writes nothing) |
| `npm run catalog:apply` | Write doctor-approved catalog rows to Firestore (backs up first) |
| `npm run firebase:deploy-rules` | Deploy Firestore / Storage / RTDB rules (needs `firebase login`) |

## Deploying to Vercel

Deploy this folder as the project root (so `api/` and `middleware.js` are
picked up). Set every variable from `emr/kid/.env.example` in the Vercel
dashboard, using `KID_FIREBASE_SERVICE_ACCOUNT_KEY` (paste the JSON) instead of
`GOOGLE_APPLICATION_CREDENTIALS`.
