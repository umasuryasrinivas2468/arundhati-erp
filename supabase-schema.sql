-- Arundhati ERP — Supabase tables for the Vercel deployment (api/handler.js). Run once in Supabase → SQL Editor.
-- RLS on with NO policies: only the server-side service_role key can read or write. Keep that key server-only.

-- The whole ERP state as one JSON object (already exists on the current deployment).
create table if not exists public.erp_state (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);
alter table public.erp_state enable row level security;

-- scrypt password hashes ("salt:hash"), filled in as each user signs in or changes their password.
create table if not exists public.erp_passwords (
  emp_id  text primary key,
  hash    text not null
);
alter table public.erp_passwords enable row level security;
