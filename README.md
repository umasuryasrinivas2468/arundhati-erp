# CampusHub AIMS

Campus ERP for Arundhati Medical College & Hospital — attendance, leave workflow and
role dashboards for students, faculty and administration.

The app is a **Next.js (App Router)** project in [`web/`](web/), deployed on an
**EC2** box (systemd running `next start` behind Caddy for automatic HTTPS) with a
**Supabase Postgres** backend (the whole ERP database stored as one `jsonb` row,
read/written through `web/app/api/[op]/route.js`).

> The previous static HTML/JS app (served by a Node `server.js` with SQLite) was retired
> in favour of this Next.js build. See git history for that earlier implementation.

## Run locally

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Without Supabase env vars the app falls back to seeded **offline mode** (browser
`localStorage`), so it runs with no backend for local development.

## Production (EC2 + Caddy + Supabase)

- **Backend:** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and run
  `web/supabase-schema.sql` once in Supabase → SQL Editor.
- **First-time / reconfigure the box** (as root), which installs Node 22 + Caddy, writes
  the systemd unit + Caddyfile, stores the Supabase creds, builds and starts the app:

  ```bash
  cd /opt/arundhati-erp
  sudo DOMAIN=campushub.aims.ac.in \
       REPO=https://github.com/umasuryasrinivas2468/arundhati-erp.git BRANCH=main \
       SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       bash deploy/setup.sh
  ```

- **Ongoing deploys are automatic:** every push to `main` runs
  `.github/workflows/deploy.yml` — build check → SSH → `git reset` + `npm ci` +
  `next build` → restart → health check on `/api/db` (rolls back on failure).
  GitHub repo secrets required: `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`, `EC2_HOST`, `EC2_USER`.

See [`web/README.md`](web/README.md) for the app structure.
