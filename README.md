# Arundhati ERP

Staff attendance & leave ERP for Arundhati Medical College & Hospital. Static HTML/JS front-end plus one dependency-free Node server (`server.js`).

**Run:** open `index.html` in Chrome/Edge (or `npx serve .`). Data is stored in the browser's localStorage; clear site data to restore the sample data.

**Server (self-hosted, EC2):** `node server.js` (Node ≥ 22.13, no npm install) serves the app
and keeps all data in a local SQLite file (`DB_PATH`, default `./data/erp.db`). Without the
server (opened as a file / `npx serve`) the app falls back to browser localStorage.

- **Login is checked on the server.** Passwords are scrypt-hashed in their own table and never
  sent to browsers; sessions are signed HttpOnly cookies (12 h; set `SESSION_SECRET`, or a restart signs everyone out).
  10 failed logins per IP → 15-minute lockout.
- **Reads are per role** (`view()` in `lib/api.js`): admin/principal/dean see everything, a HOD sees
  their department, staff and students see only their own records. Other people's contact
  details and the student roster are hidden from non-leaders.
- **Writes are single operations** (`POST /api/op`) run on the server through the shared rules in
  `js/core.js` (leave workflow, quotas, uploads, users, announcements) with permission checks —
  e.g. only the HOD/Principal a leave is waiting on can act on it; only admins upload attendance
  or manage users. There is no "save the whole database" endpoint.
- The roster/attendance seed files are served as empty stubs, so the data isn't public.

**Load data:** `DB_PATH=/path/erp.db node server.js import export.json` (a full ERP JSON blob —
`{db}`, a Supabase `{data}` row or the raw object; plaintext passwords in it are hashed).

**Deploy:** `deploy/setup.sh` turns a fresh Ubuntu 24.04 EC2 into the server: Node 22, Caddy
(automatic HTTPS for `DOMAIN`), a systemd service, nightly SQLite backups (14 days local,
optional S3 via `BACKUP_BUCKET`). Update later with
`cd /opt/arundhati-erp && git pull && systemctl restart arundhati-erp`.

**Deploy on Vercel + Supabase instead:** the same API runs as `api/handler.js` (routes in
`vercel.json` — only the HTML pages, `js/`, `css/`, `assets/` and the API are reachable).
1. Run `supabase-schema.sql` once in Supabase → SQL Editor (adds `erp_passwords`).
2. Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (`openssl rand -hex 32`).
3. Deploy. Everyone signs in again; plaintext passwords still in the stored blob work once and
   are moved into `erp_passwords` on that first sign-in.

**Check:** `node test/server.check.js` (EC2 server, SQLite) and `node test/vercel.check.js
[blob.json]` (Vercel handler against a fake Supabase) assert the permission rules.

Staff logins are seeded from `js/employees.js`, generated from *EDITED EMPLOYEE LIST 12.xls* (158 staff, 42 departments). Each record carries a `leaveCategory` (doctor / teaching / non-teaching) that drives leave entitlement. **Username = employee code** (case-insensitive, e.g. `c024`, `1140`), **default password `aims@123`** — staff can change it under Profile.

| Role | Login | Who |
|---|---|---|
| Admin | `admin` / `admin123` | ERP administrator |
| Principal | `c024` | Dr. K Vijaya Kumar |
| Principal (hospital) | `1734` | Dr. B Devanand, Medical Superintendent |
| Dean | `755` | Dr. A. Suma Preethi |
| HOD | e.g. `817` (Pathology), `c030` (Biochemistry), `aims0379` (General Medicine) | 23 department heads |
| Faculty / Staff | e.g. `1140`, `c037` | everyone else |
| Student (MBBS) | e.g. `2601052001` | 600 I/II/III/IV-year students |

**Student module:** MBBS students are seeded from `js/students.js` (generated from the
1/2/3/4-year MBBS lists — 600 students: 150 I, 150 II, 163 III, 137 IV). **Login is the college
email `rollno@aims.ac.in` and the password is the roll number** (students can also sign in
with the bare roll number, and change the password under Profile). The student portal
(`student.html` + `js/student.js`) gives each student a dashboard with a live attendance
ring, a monthly attendance calendar/list with Excel export, a digital student ID card, and
announcements. Admins manage the roster under **Admin → Students** (searchable directory by
year, per-student attendance detail). Student attendance imports through the same **Upload
Attendance** screen — the roll number goes in the *Employee ID* column.

**Attendance Excel format** (Admin → Upload Attendance has a template download):
`Employee ID | Name | Department | Date | Status | In Time | Out Time` — Status is `P`, `A`, `L`, `HD` (half day) or `OD` (on duty); Date is `DD/MM/YYYY` or `YYYY-MM-DD`.

**Biometric reports:** the uploader also auto-detects the machine's *Monthly Status Report (Basic Work Duration)* matrix export (days across columns, a Status/InTime/OutTime block per employee) — upload the `.xls` as-is. Codes map `P→P`, `A→A`, `WOP`/`HP→P` (worked on a week-off/holiday); `WO`/`H` (weekly-off/holiday) create no record. Codes not in the staff master are flagged as errors and skipped.

**Leave workflow:** Faculty applies → HOD recommends/rejects → Principal approves/rejects. HOD and Dean leave — and staff in departments without a HOD (Admin, Housekeeping, Accounts, OT staff, …) — goes straight to the Principal.

**Leave entitlement** (per `LEAVE_CATEGORY_QUOTAS` in `js/core.js`, from the leave-policy note): Casual Leave (CL) — Doctors 24/yr (2/month), Teaching & Non-teaching 12/yr. Academic Leave (AL) — Doctors 8/yr. On Duty (OD) 10/yr and Loss of Pay (LOP, uncapped) for all. Entitlement is resolved per employee from their `leaveCategory`.

**Biometric late-punch policy** (shown as an announcement): >15 min late = a late punch; 1st–2nd late punches/month = no loss of pay; 3rd–5th = half-day LOP each; beyond 5th = one full day LOP each. Displayed only — attendance is imported from the biometric reports, not computed from punch times.

Files: `js/data.js` (data layer), `js/ui.js` + `css/styles.css` (shared shell), one HTML + JS per role, `js/leaders.js` (shared by HOD/Principal/Dean), `js/students.js` (MBBS roster) + `js/student.js` (student portal).
