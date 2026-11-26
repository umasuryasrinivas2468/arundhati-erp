# Arundhati ERP

Staff attendance & leave ERP for Arundhati Medical College & Hospital. Static HTML/JS — no install, no server.

**Run:** open `index.html` in Chrome/Edge (or `npx serve .`). Data is stored in the browser's localStorage; use *Demo login → Reset demo data* to restore the sample data.

**Shared server store:** the app reads and writes one shared database through `/api/db`
(a Vercel function backed by **Supabase** Postgres), so every user sees the same data and
admin uploads/leave approvals persist for everyone. When no server is reachable (opened
as a `file://` or via `npx serve`), it transparently falls back to browser localStorage,
so local demos still work offline. The whole DB is stored as one JSON value in a single
`jsonb` row (`public.erp_state`, id `arundhati-erp:v3`); writes are last-write-wins, and
because navigation reloads each page, everyone converges on the latest data. The function
talks to Supabase through its REST API, so there is **no npm dependency** to install.

**Set up the database (Supabase):**
1. Create a project at [supabase.com](https://supabase.com) (or add the Supabase
   integration in **Vercel → Integrations**, which provisions one and injects the env vars).
2. In **Supabase → SQL Editor**, run `supabase-schema.sql` (creates the `erp_state` table).
3. Set two env vars (auto-injected by the Vercel integration, or copy from
   **Supabase → Settings → API**):
   - `SUPABASE_URL` — the project URL, e.g. `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** secret key (not the anon key; keep it server-only).

**Deploy (Vercel):**
1. `vercel link` (create/select the project).
2. Add the two env vars above (`vercel env add …`, or the Vercel dashboard / Supabase integration).
3. `vercel --prod`.

No build step — static files are served as-is and `api/db.js` is built as a function.
`vercel.json` pins `framework: null` and keeps `.html` URLs. For local dev with the
server: `vercel env pull .env.local` then `vercel dev`.

**Preloaded attendance:** October 2026 (01–26 Oct) and November 2026 (01–10 Nov) attendance
is seeded from the biometric *Basic Work Duration* reports (`js/attendance-seed.js`, 4,821
records) into the store on first load, and shows up under Admin → Upload history as two
imports (one per monthly report). Bumping the DB `version` in `js/data.js` forces a re-seed
and **overwrites** the store, so only do that for a deliberate reset.

**Security note:** `/api/db` is an open same-origin endpoint (no server-side auth — login
is still client-side), so anyone who can reach the site can read or overwrite the DB. Fine
for an internal/trusted deployment; a public one needs real auth + per-record endpoints.

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

**Leave entitlement** (per `LEAVE_CATEGORY_QUOTAS` in `js/data.js`, from the leave-policy note): Casual Leave (CL) — Doctors 24/yr (2/month), Teaching & Non-teaching 12/yr. Academic Leave (AL) — Doctors 8/yr. On Duty (OD) 10/yr and Loss of Pay (LOP, uncapped) for all. Entitlement is resolved per employee from their `leaveCategory`.

**Biometric late-punch policy** (shown as an announcement): >15 min late = a late punch; 1st–2nd late punches/month = no loss of pay; 3rd–5th = half-day LOP each; beyond 5th = one full day LOP each. Displayed only — attendance is imported from the biometric reports, not computed from punch times.

Files: `js/data.js` (data layer), `js/ui.js` + `css/styles.css` (shared shell), one HTML + JS per role, `js/leaders.js` (shared by HOD/Principal/Dean), `js/students.js` (MBBS roster) + `js/student.js` (student portal).
