-- Arundhati ERP — Supabase table for the shared data store.
-- Run this once in Supabase → SQL Editor (or `supabase db` / psql) before first use.
--
-- The whole ERP database is stored as ONE JSON object in a single row, so the serverless
-- function (api/db.js) just reads/writes that row. RLS is enabled and NO policies are
-- added, which means anon/authenticated clients are blocked — only the server-side
-- service_role key (used by api/db.js) can read or write it. Keep that key server-only.

create table if not exists public.erp_state (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

alter table public.erp_state enable row level security;
