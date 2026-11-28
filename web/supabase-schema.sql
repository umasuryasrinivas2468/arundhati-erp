-- CampusHub AIMS — Supabase table for the Next.js app (web/app/api/db/route.js).
-- Run once in Supabase → SQL Editor.
-- RLS on with NO policies: only the server-side service_role key can read or write.
-- Keep SUPABASE_SERVICE_ROLE_KEY server-only (it is read by the /api/db route, never shipped to browsers).

-- The whole ERP state is stored as one JSON object in a single row.
create table if not exists public.erp_state (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);
alter table public.erp_state enable row level security;
