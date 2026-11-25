-- Arundhati ERP — normalized relational schema (people + operational data as real tables).
-- Run once in Supabase → SQL Editor. RLS is ON with no policies, so only the server-side
-- service_role key (used by api/db.js) can read/write — browser/anon clients are blocked.
--
-- Design: faculty / HOD / dean / principal / admin share identical fields, so they live in
-- ONE `staff` table keyed by role, with per-role VIEWS for convenience. Students have their
-- own table. Attendance / leaves / uploads / announcements / notifications are separate tables.

-- ---------- master data ----------
create table if not exists public.departments (
  code text primary key,
  name text not null
);

create table if not exists public.staff (
  emp_id         text primary key,
  username       text unique not null,
  password       text not null,
  role           text not null check (role in ('admin','principal','dean','hod','faculty')),
  name           text not null,
  designation    text,
  dept           text references public.departments(code),
  company        text,
  timings        text,
  reports_to     text,
  leave_category text check (leave_category in ('doctor','teaching','nonteaching')),
  email          text,
  phone          text,
  join_date      date,
  created_at     timestamptz not null default now()
);
create index if not exists staff_role_idx on public.staff (role);
create index if not exists staff_dept_idx on public.staff (dept);

create table if not exists public.students (
  roll_no    text primary key,
  username   text unique not null,
  password   text not null,
  name       text not null,
  year       int check (year between 1 and 4),
  batch      text,
  email      text,
  phone      text,
  join_date  date,
  created_at timestamptz not null default now()
);
create index if not exists students_year_idx on public.students (year);

-- ---------- operational data ----------
-- person_id is a staff emp_id OR a student roll_no (no FK, since it can point to either).
create table if not exists public.attendance (
  id         bigint generated always as identity primary key,
  person_id  text not null,
  date       date not null,
  status     text not null check (status in ('P','A','L','HD','OD')),
  in_time    text,
  out_time   text,
  upload_id  text,
  unique (person_id, date)
);
create index if not exists attendance_person_idx on public.attendance (person_id);
create index if not exists attendance_date_idx   on public.attendance (date);

create table if not exists public.uploads (
  id          text primary key,
  file_name   text,
  uploaded_by text,
  at          timestamptz,
  rows        int,
  replaced    int,
  date_from   date,
  date_to     date
);

create table if not exists public.leaves (
  id         text primary key,
  emp_id     text not null references public.staff(emp_id) on delete cascade,
  type       text not null check (type in ('CL','AL','OD','LOP')),
  date_from  date not null,
  date_to    date not null,
  days       numeric not null,
  half_day   boolean not null default false,
  reason     text,
  status     text not null,
  applied_at timestamptz not null default now(),
  history    jsonb not null default '[]'::jsonb
);
create index if not exists leaves_emp_idx    on public.leaves (emp_id);
create index if not exists leaves_status_idx on public.leaves (status);

create table if not exists public.announcements (
  id    text primary key,
  title text,
  body  text,
  by    text,
  at    timestamptz not null default now()
);

create table if not exists public.notifications (
  id    text primary key,
  to_id text not null,
  text  text,
  at    timestamptz not null default now(),
  read  boolean not null default false
);
create index if not exists notifications_to_idx on public.notifications (to_id);

-- ---------- row level security (server-only) ----------
alter table public.departments   enable row level security;
alter table public.staff         enable row level security;
alter table public.students      enable row level security;
alter table public.attendance    enable row level security;
alter table public.uploads       enable row level security;
alter table public.leaves        enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;

-- ---------- per-role convenience views ----------
create or replace view public.v_faculty    as select * from public.staff where role = 'faculty';
create or replace view public.v_hods       as select * from public.staff where role = 'hod';
create or replace view public.v_deans      as select * from public.staff where role = 'dean';
create or replace view public.v_principals as select * from public.staff where role = 'principal';
