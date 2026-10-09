-- =====================================================================================
-- Ervin Central — Supabase schema, exactly as applied on 2026-10-09
-- Project: ervin-data (ref gflocxcogragbwjplwgt), org "Ervin", Free plan, US East 2 (Ohio)
-- Safe to re-run: every statement is idempotent.
-- =====================================================================================

-- ---- Schema --------------------------------------------------------------------------
create schema if not exists ervin_central;
comment on schema ervin_central is 'Ervin Central family hub app';
grant usage on schema ervin_central to anon, authenticated, service_role;

-- ---- Append-only op log --------------------------------------------------------------
-- Every change (chore tick/untick, request, approve, decline, entry, remove, zero, wipe, merge)
-- is one row. Each device replays the log in seq order (js/store.js → replay()) to rebuild every
-- kid's ledger. Access control is intentionally open for now (Matt's call): anyone with the
-- publishable key can READ and ADD ops, but nobody can edit or delete history through the API.
create table if not exists ervin_central.ops (
  seq        bigint generated always as identity primary key,
  op_id      text not null unique,          -- minted on the device, makes retries harmless
  bin        text not null,                 -- which kid the op belongs to (evelynn / avery)
  op         jsonb not null,                -- the operation itself
  device     text,                          -- random id of the device that sent it (debugging)
  created_at timestamptz not null default now()
);
comment on table ervin_central.ops is 'Ervin Central event log: replay in seq order to rebuild state';

alter table ervin_central.ops enable row level security;

grant select, insert on ervin_central.ops to anon, authenticated;   -- NEVER grant update/delete
grant all on ervin_central.ops to service_role;
grant usage, select on all sequences in schema ervin_central to anon, authenticated, service_role;

drop policy if exists "family can read ops" on ervin_central.ops;
create policy "family can read ops" on ervin_central.ops for select to anon, authenticated using (true);
drop policy if exists "family can add ops" on ervin_central.ops;
create policy "family can add ops" on ervin_central.ops for insert to anon, authenticated with check (true);

notify pgrst, 'reload schema';

-- ---- Verification (expected: rowsecurity=true, select/insert=true, update/delete=false) ---
select tablename, rowsecurity,
  has_table_privilege('anon', 'ervin_central.ops', 'SELECT') as anon_select,
  has_table_privilege('anon', 'ervin_central.ops', 'INSERT') as anon_insert,
  has_table_privilege('anon', 'ervin_central.ops', 'UPDATE') as anon_update,
  has_table_privilege('anon', 'ervin_central.ops', 'DELETE') as anon_delete
from pg_tables where schemaname = 'ervin_central';

-- =====================================================================================
-- Dashboard settings applied by hand (not SQL) on 2026-10-09:
--   Integrations → Data API → Settings
--     Exposed schemas: public, graphql_public, ervin_central
--     Automatically expose new tables: OFF
--   Project creation: Enable automatic RLS = ON
--   Authentication → Sign In / Providers: Email ON, Allow new users to sign up OFF, Confirm email ON
--   Authentication → URL Configuration:
--     Site URL: https://mattjervin.github.io
--     Redirect URLs: https://mattjervin.github.io/**  and  http://localhost:*/**
-- API: URL https://gflocxcogragbwjplwgt.supabase.co
--      publishable key sb_publishable_JSzTVUs3AyUFBI5wmTmUpA_meMYDSIr (public-safe; in data/family.json)
--      secret key: dashboard only — never in the repo
-- =====================================================================================
