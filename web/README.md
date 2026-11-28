# CampusHub AIMS — Next.js app

A React/Next.js (App Router) app for Arundhati Medical College & Hospital. It talks to a
`/api/db` endpoint backed by **Supabase Postgres** (the whole DB as one `jsonb` row). All
business logic (auth, leave workflow, attendance rules) lives in `lib/erp.js`.

## Run locally

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Without Supabase env vars the app automatically falls back to seeded **offline mode**
(browser `localStorage`), exactly like the original — so it runs with no backend for
local development.

## Build

```bash
npm run build && npm run start
```

## Deploy (EC2 + Caddy + Supabase)

Production runs on an EC2 box: systemd runs `next start` on port 3000, Caddy terminates
HTTPS and reverse-proxies to it. See the repo root `README.md` and `deploy/setup.sh`.

1. Provision/reconfigure the box with `deploy/setup.sh` (installs Node 22 + Caddy, writes
   the systemd unit + Caddyfile, stores the Supabase creds, builds and starts the app).
2. Supabase env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings
   → API) are read by `app/api/[op]/route.js` (plus `SESSION_SECRET`, made by `deploy/release.sh`). Run `supabase-schema.sql` (in this folder) once.
3. Pushes to `main` auto-deploy via `.github/workflows/deploy.yml`.

## Structure

| Path | Role |
|---|---|
| `app/api/[op]/route.js` | The backend — login/logout/password, and `/api/db`: each role reads only what it may see and writes only what it may change (one `jsonb` row in Supabase). |
| `lib/erp.js` | Data + business-logic layer. Async load, `subscribe()` for reactivity. |
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
