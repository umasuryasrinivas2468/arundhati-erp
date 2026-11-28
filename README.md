# Arundhati ERP — Next.js front-end

A React/Next.js (App Router) application. **The backend contract**: it talks to a
`/api/db` endpoint backed by **Supabase Postgres** (the whole DB as one `jsonb` row).
All business logic (auth, leave workflow, attendance rules) lives in `lib/erp.js`.

> This is the main (and only) UI. It replaced an earlier static HTML/JS build that
> previously lived in the repo root.

## Run locally

```bash
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

## Deploy to Vercel

The repo root is a self-contained Next.js project (auto-detected by Vercel; no Root
Directory override needed).

1. Add the Supabase env vars — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   (from Supabase → Settings → API, or the Vercel → Supabase integration), which
   `app/api/db/route.js` reads. Run `supabase-schema.sql` (repo root) once.
2. Deploy.

## Structure

| Path | Role |
|---|---|
| `app/api/db/route.js` | The backend — GET/PUT the whole DB as one `jsonb` row in Supabase. |
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
