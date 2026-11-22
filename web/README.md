# Arundhati ERP — Next.js front-end

A React/Next.js (App Router) port of the original static HTML/JS app that lives in the
repo root. **The backend contract is unchanged**: it talks to the same `/api/db`
endpoint backed by the same Upstash Redis store, with the same env vars. Only the UI
layer was rewritten — all business logic (auth, leave workflow, attendance rules) was
carried over verbatim into `lib/erp.js`.

## Run locally

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Without Redis env vars the app automatically falls back to seeded **offline mode**
(browser `localStorage`), exactly like the original — so it runs with no backend for
local development. Demo logins are shown on the sign-in page.

## Build

```bash
npm run build && npm run start
```

## Deploy to Vercel

This folder is a self-contained Vercel project.

1. In your Vercel project settings, set **Root Directory = `web`**.
2. Keep the existing **Upstash / KV (Redis) integration** — it provisions
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_*`), which
   `app/api/db/route.js` reads unchanged.
3. Deploy. The old static build stays in the repo root and is unaffected until you
   switch the root directory.

## Structure

| Path | Role |
|---|---|
| `app/api/db/route.js` | The backend — GET/PUT the whole DB as one gzipped JSON blob in Redis. Ported 1:1 from the old `api/db.js`. |
| `lib/erp.js` | Data + business-logic layer (ported from `js/data.js`). Async load, `subscribe()` for reactivity. |
| `lib/seed/*` | Staff, student and attendance seed data (converted to ES modules). |
| `lib/ErpProvider.jsx` | `<ErpProvider>`, `useErp()`, `useRequireRole()`. |
| `components/*` | The old `js/ui.js` mini-framework rebuilt as React: `Shell`, `DataTable`, `Modal`, `Toast`, `Icon`, charts (`ui.jsx`), `Calendar`, and the shared leader screens (`leaders.jsx`). |
| `app/{faculty,hod,dean,principal,admin,student}/page.jsx` | The six role portals. |
| `app/page.jsx` | Login. |
| `app/globals.css` | `styles.css` + `leaders.css` + page styles, carried over verbatim (shell selectors rescoped from `body.app` → `.app-shell`, login `body.login` → `.lg-page`). |

## Known minor difference

The student dashboard's mini attendance-calendar reuses the shared `<AttendanceCalendar>`,
so its day tooltips read "Worked …" / "No record uploaded" instead of the original
"On campus …" / "No record". Cosmetic only.
