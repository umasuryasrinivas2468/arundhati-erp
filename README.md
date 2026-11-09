# Arundhati ERP

Staff attendance & leave ERP for Arundhati Medical College & Hospital. Static HTML/JS — no install, no server.

**Run:** open `index.html` in Chrome/Edge (or `npx serve .`). Data is stored in the browser's localStorage; use *Demo login → Reset demo data* to restore the sample data.

**Shared server store:** the app reads and writes one shared database through `/api/db`
(a Vercel function backed by **Upstash Redis**), so every user sees the same data and
admin uploads/leave approvals persist for everyone. When no server is reachable (opened
as a `file://` or via `npx serve`), it transparently falls back to browser localStorage,
so local demos still work offline. The whole DB is stored as one gzipped JSON value
(`arundhati-erp:db:v3`); writes are last-write-wins, and because navigation reloads each
page, everyone converges on the latest data.

**Deploy (Vercel):**
1. `vercel link` (create/select the project).
2. Provision the store so env vars are injected: `vercel integration add upstash` (or
   Vercel dashboard → Storage → **Upstash Redis / KV** → connect to the project). This
   sets `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (the function also accepts
   `KV_*`).
3. `vercel --prod`.

No build step — static files are served as-is and `api/db.js` is built as a function.
`vercel.json` pins `framework: null` and keeps `.html` URLs. For local dev with the
server: `vercel env pull .env.local` then `vercel dev`.

**Preloaded attendance:** October 2026 attendance (01–26 Oct) is seeded from the two
biometric *Basic Work Duration* reports (`js/attendance-seed.js`, 3,563 records across
167 staff) into the store on first load, and shows up under Admin → Upload history as one
import. Bumping the DB `version` in `js/data.js` forces a re-seed and **overwrites** the
store, so only do that for a deliberate reset.

**Security note:** `/api/db` is an open same-origin endpoint (no server-side auth — login
is still client-side), so anyone who can reach the site can read or overwrite the DB. Fine
for an internal/trusted deployment; a public one needs real auth + per-record endpoints.

Staff logins are seeded from `js/employees.js`, generated from *EDITED EMPLOYEE LIST.xls* (158 staff, 40 departments). **Username = employee code** (case-insensitive, e.g. `c024`, `1140`), **default password `aims@123`** — staff can change it under Profile.

| Role | Login | Who |
|---|---|---|
| Admin | `admin` / `admin123` | ERP administrator |
| Principal | `c024` | Dr. K Vijaya Kumar |
| Principal (hospital) | `1734` | Dr. B Devanand, Medical Superintendent |
| Dean | `755` | Dr. A. Suma Preethi |
| HOD | e.g. `817` (Pathology), `c030` (Biochemistry), `aims0379` (General Medicine) | 23 department heads |
| Faculty / Staff | e.g. `1140`, `c037` | everyone else |
| Student (MBBS) | e.g. `2501052001` | 450 II/III/IV-year students |

**Student module:** MBBS students are seeded from `js/students.js` (generated from the
2/3/4-year MBBS lists — 450 students: 150 II, 163 III, 137 IV). **Login is the college
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

Files: `js/data.js` (data layer), `js/ui.js` + `css/styles.css` (shared shell), one HTML + JS per role, `js/leaders.js` (shared by HOD/Principal/Dean), `js/students.js` (MBBS roster) + `js/student.js` (student portal).
