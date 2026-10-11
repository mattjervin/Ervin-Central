-- =====================================================================================
-- Ervin Central — Supabase schema, exactly as applied (2026-10-09, chore log + push + lock 2026-10-11)
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
-- kid's ledger. Nobody can edit or delete history through the API. (Until 2026-10-11 anyone with the
-- publishable key could read and add ops; the lock below replaced that with per-device keys.)
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

-- ---- Who entered each change + the readable chore log (applied 2026-10-11) -----------
-- Every op the app sends carries who entered it and the device's friendly name. chore_log turns
-- the raw log into one readable row per change; Parent management → "Who did what" reads it.
alter table ervin_central.ops
  add column if not exists entered_by  text,   -- 'kid' (kid coin code / untick) or the unlocked parent: 'dad' | 'mom'
  add column if not exists device_name text;   -- the device's friendly name ('Kitchen iPad'), set in Parent management
comment on column ervin_central.ops.entered_by is 'kid = entered with the kids coin code (or an untick); dad / mom = that parent was unlocked';
comment on column ervin_central.ops.device_name is 'Friendly name of the device that sent the op, as named in Parent management';

create or replace view ervin_central.chore_log with (security_invoker = true) as
select
  o.seq,
  o.created_at,
  (o.created_at at time zone 'America/Chicago') as logged_at_local,
  o.bin as kid,
  case o.op->>'t'
    when 'chore'   then case when (o.op->>'on')::boolean then 'chore done' else 'chore undone' end
    when 'request' then case when o.op->'item'->>'type' = 'reward' then 'reward asked' else 'extra asked' end
    when 'approve' then case when r.op->'item'->>'type' = 'reward' then 'reward approved' else 'extra approved' end
    when 'decline' then case when r.op->'item'->>'type' = 'reward' then 'reward declined' else 'extra declined' end
    when 'entry'   then case o.op->'entry'->>'type' when 'spend' then 'spent offline' when 'bonus' then 'kindness catch' else 'coins adjusted' end
    when 'remove'  then 'entry removed'
    when 'zero'    then 'jar zeroed'
    when 'wipe'    then 'history wiped'
    when 'merge'   then 'old coins moved in'
    else o.op->>'t'
  end as action,
  coalesce(o.op->'entry'->>'reason', o.op->'item'->>'title', r.op->'item'->>'title') as item,
  coalesce(o.op->>'choreId', o.op->'item'->>'choreId', r.op->'item'->>'choreId') as item_id,
  case o.op->>'t'
    when 'chore'   then (case when (o.op->>'on')::boolean then 1 else -1 end) * (o.op->'entry'->>'amount')::int
    when 'approve' then (r.op->'item'->>'amount')::int
    when 'entry'   then (o.op->'entry'->>'amount')::int
  end as coins,
  coalesce(o.op->'entry'->>'house', o.op->'item'->>'house', r.op->'item'->>'house', o.op->>'house') as house,
  case when o.op->>'t' = 'chore' then (o.op->>'date')::date end as counts_for,  -- the day, or the Monday of the week for weekly chores
  o.entered_by,
  o.device_name,
  o.device
from ervin_central.ops o
left join ervin_central.ops r
  on o.op->>'t' in ('approve', 'decline')
 and r.bin = o.bin
 and r.op->>'t' = 'request'
 and r.op->'item'->>'id' = o.op->>'id';

comment on view ervin_central.chore_log is 'Readable Ervin Central history: one row per op — who, what, coins, house, when, entered by, device. Read-only.';
grant select on ervin_central.chore_log to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ---- Push notifications: a parent's phone hears when a kid asks for an OK (applied 2026-10-11) --
-- A parent turns them on in Parent management (Web Push from the home-screen app; sw.js shows them).
-- Subscriptions are per device and per house: a request into Mom's jar notifies Mom's devices.
-- Nothing here is readable through the API: anon can only call the four rpc functions below.
-- The VAPID private key, the function URL and the gone-token live in push_config, filled by hand
-- (never in the repo):
--   insert into ervin_central.push_config (k, v) values ('vapid_public', '<public key>'), ('vapid_private', '<private key>'),
--     ('vapid_subject', 'https://mattjervin.github.io/Ervin-Central/'),
--     ('fn_url', 'https://gflocxcogragbwjplwgt.supabase.co/functions/v1/ervin-central-push'),
--     ('gone_token', '<random string>') on conflict (k) do update set v = excluded.v;
-- The sending itself is the Edge Function supabase/functions/ervin-central-push (verify_jwt off).
create extension if not exists pg_net with schema extensions;

create table if not exists ervin_central.push_subs (
  endpoint    text primary key,                 -- the browser's push endpoint (Apple / Google / Mozilla)
  p256dh      text not null,
  auth        text not null,
  house       text not null check (house in ('dad', 'mom')),
  device_name text,
  created_at  timestamptz not null default now()
);
alter table ervin_central.push_subs enable row level security;
revoke all on ervin_central.push_subs from anon, authenticated;

create table if not exists ervin_central.push_config (k text primary key, v text not null);
alter table ervin_central.push_config enable row level security;
revoke all on ervin_central.push_config from anon, authenticated;

-- Hand a batch of subscriptions + a message to the Edge Function (async, via pg_net). Internal only.
create or replace function ervin_central.push_send(p_subs jsonb, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb;
begin
  if p_subs is null or jsonb_array_length(p_subs) = 0 then return; end if;
  select jsonb_object_agg(k, v) into cfg from ervin_central.push_config;
  if cfg->>'vapid_private' is null or cfg->>'fn_url' is null then return; end if;
  perform net.http_post(
    url := cfg->>'fn_url',
    body := jsonb_build_object(
      'vapid', jsonb_build_object('publicKey', cfg->>'vapid_public', 'privateKey', cfg->>'vapid_private', 'subject', cfg->>'vapid_subject'),
      'subs', p_subs, 'payload', p_payload, 'token', cfg->>'gone_token'),
    headers := '{"Content-Type": "application/json"}'::jsonb);
end $$;
revoke execute on function ervin_central.push_send(jsonb, jsonb) from public, anon, authenticated;

-- After a kid's request lands (an extra chore or a reward), notify that house's parent. Skipped when
-- that parent entered it themselves. Never blocks the insert: any error is only a warning.
create or replace function ervin_central.notify_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  it   jsonb := new.op->'item';
  h    text := coalesce(new.op->'item'->>'house', 'dad');
  who  text := initcap(new.bin);
  what text := concat_ws(' ', new.op->'item'->>'icon', new.op->'item'->>'title');
  amt  int := abs(coalesce((new.op->'item'->>'amount')::int, 0));
  jar  text := case coalesce(new.op->'item'->>'house', 'dad') when 'mom' then 'Mom''s' else 'Dad''s' end;
  subs jsonb;
begin
  if new.entered_by is not distinct from h then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into subs from ervin_central.push_subs s where s.house = h;
  perform ervin_central.push_send(subs, jsonb_build_object(
    'title', case when it->>'type' = 'reward' then who || ' wants a reward' else who || ' finished an extra chore' end,
    'body',  case when it->>'type' = 'reward'
               then what || ' · ' || amt || ' coins from ' || jar || ' jar — tap to OK it'
               else what || ' · +' || amt || ' coins at ' || jar || ' — tap to OK it' end,
    'tag',   'req-' || coalesce(it->>'id', new.op_id),
    'url',   './#/admin'));
  return new;
exception when others then
  raise warning 'notify_request: %', sqlerrm;
  return new;
end $$;
revoke execute on function ervin_central.notify_request() from public, anon, authenticated;

drop trigger if exists notify_request on ervin_central.ops;
create trigger notify_request after insert on ervin_central.ops
  for each row when (new.op->>'t' = 'request') execute function ervin_central.notify_request();

-- The four calls the site makes (rpc/…): subscribe, unsubscribe, which house this device is on, test.
create or replace function ervin_central.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_house text, p_device_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad subscription';
  end if;
  insert into ervin_central.push_subs (endpoint, p256dh, auth, house, device_name)
  values (p_endpoint, p_p256dh, p_auth, p_house, left(p_device_name, 40))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, house = excluded.house, device_name = excluded.device_name;
end $$;

create or replace function ervin_central.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from ervin_central.push_subs where endpoint = p_endpoint;
$$;

create or replace function ervin_central.push_house(p_endpoint text) returns text
language sql stable security definer set search_path = '' as $$
  select house from ervin_central.push_subs where endpoint = p_endpoint;
$$;

create or replace function ervin_central.push_test(p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s ervin_central.push_subs;
begin
  select * into s from ervin_central.push_subs where endpoint = p_endpoint;
  if not found then return false; end if;
  perform ervin_central.push_send(
    jsonb_build_array(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)),
    jsonb_build_object('title', 'Ervin Central', 'tag', 'test', 'url', './#/admin',
      'body', '🔔 Notifications work. You’ll hear when an extra or a reward is waiting for '
        || case s.house when 'mom' then 'Mom' else 'Dad' end || '’s OK.'));
  return true;
end $$;

-- The Edge Function reports subscriptions the push service has dropped (404/410).
create or replace function ervin_central.push_gone(p_token text, p_endpoints text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token is distinct from (select v from ervin_central.push_config where k = 'gone_token') then return; end if;
  delete from ervin_central.push_subs where endpoint = any(p_endpoints);
end $$;

revoke execute on function ervin_central.push_subscribe(text, text, text, text, text), ervin_central.push_unsubscribe(text),
  ervin_central.push_house(text), ervin_central.push_test(text), ervin_central.push_gone(text, text[]) from public;
grant execute on function ervin_central.push_subscribe(text, text, text, text, text), ervin_central.push_unsubscribe(text),
  ervin_central.push_house(text), ervin_central.push_test(text), ervin_central.push_gone(text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---- Locked down: family data behind per-device keys (applied 2026-10-11) -----------------------
-- The family's own data (family, calendar, chores, school, menus) lives here, not in the public repo.
-- Matt's Mac publishes it from the private repo (scripts/publish.mjs, with the admin token from the
-- macOS keychain). Every family device holds its own random key (localStorage 'ervin-central:key');
-- only its SHA-256 is stored. Without a key the site gets the public slice only: Grandparents Central
-- (the girls' games, shows and birthdays, public venues). Nothing below is readable through the API:
-- anon can only call the ec_* functions, and each checks the key itself.
create extension if not exists pgcrypto with schema extensions;

create table if not exists ervin_central.config (
  name       text primary key check (name in ('family', 'calendar', 'chores', 'school', 'menus')),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists ervin_central.config_history (
  id           bigint generated always as identity primary key,
  name         text not null,
  data         jsonb not null,
  published_at timestamptz not null default now()
);
create table if not exists ervin_central.devices (
  key_hash    text primary key,             -- sha256 of the device's key; the key itself is only on the device
  device      text,                         -- the device's random id (same as ops.device)
  device_name text,
  me          text,                         -- whose device ('avery', 'dad'…) when it was set up
  how         text not null,                -- 'carried over' | 'dad code' | 'mom code' | 'kids code'
  version     text,                         -- site version it last opened with
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  revoked_at  timestamptz
);
create table if not exists ervin_central.settings (k text primary key, v text not null);   -- admin_token_hash, carry_over_until
create table if not exists ervin_central.unlock_attempts (
  id bigint generated always as identity primary key, device text, ok boolean not null, at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['config', 'config_history', 'devices', 'settings', 'unlock_attempts'] loop
    execute format('alter table ervin_central.%I enable row level security', t);
    execute format('revoke all on ervin_central.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---- Internal helpers (not callable through the API) ----
create or replace function ervin_central.sha256_hex(t text) returns text
language sql immutable set search_path = '' as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

create or replace function ervin_central.key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_key is not null and exists (select 1 from ervin_central.devices d
    where d.key_hash = ervin_central.sha256_hex(p_key) and d.revoked_at is null);
$$;

create or replace function ervin_central.require_key(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ervin_central.key_ok(p_key) then
    raise exception 'This device isn’t set up for Ervin Central' using errcode = '28000';  -- PostgREST → 403
  end if;
end $$;

create or replace function ervin_central.require_admin(p_admin text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_admin is null or ervin_central.sha256_hex(p_admin) is distinct from (select v from ervin_central.settings where k = 'admin_token_hash') then
    raise exception 'Not the admin token' using errcode = '28000';
  end if;
end $$;

create or replace function ervin_central.mint_device(p_device text, p_name text, p_me text, p_how text, p_version text) returns text
language plpgsql security definer set search_path = '' as $$
declare k text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into ervin_central.devices (key_hash, device, device_name, me, how, version, last_seen)
  values (ervin_central.sha256_hex(k), left(p_device, 40), left(p_name, 40), left(p_me, 20), p_how, left(p_version, 20), now());
  return k;
end $$;

-- Grandparents Central's rule, same as toItem() in js/data.js: `grandparents` when set, else games.
create or replace function ervin_central.gp_item(e jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(e->'grandparents') = 'boolean' then (e->>'grandparents')::boolean
              else coalesce(e->>'kind', '') = 'game' end;
$$;

-- What anyone may see: Grandparents Central's slice. No sleep schedule, chores, school, practices,
-- other kids' parties or the parents' birthdays.
create or replace function ervin_central.public_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'family', jsonb_build_object(
      'family', f.data->'family',
      'location', f.data->'location',
      'kids', (select coalesce(jsonb_agg(k - 'school'), '[]') from jsonb_array_elements(f.data->'kids') k),
      'birthdays', (select coalesce(jsonb_agg(b), '[]') from jsonb_array_elements(f.data->'birthdays') b where b ? 'kid')),
    'calendar', jsonb_build_object(
      'places', coalesce(c.data->'places', '{}'),
      'events', (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(c.data->'events') e where ervin_central.gp_item(e)),
      'recurring', (select coalesce(jsonb_agg(r), '[]') from jsonb_array_elements(c.data->'recurring') r where ervin_central.gp_item(r))))
  from (select data from ervin_central.config where name = 'family') f, (select data from ervin_central.config where name = 'calendar') c;
$$;

do $$ begin
  revoke execute on function ervin_central.sha256_hex(text), ervin_central.key_ok(text), ervin_central.require_key(text),
    ervin_central.require_admin(text), ervin_central.mint_device(text, text, text, text, text), ervin_central.gp_item(jsonb),
    ervin_central.public_config() from public, anon, authenticated;
end $$;

-- ---- What the site calls (rpc/…) ----

-- Everything the site shows. A valid key gets the family's data; anyone else gets the public slice.
create or replace function ervin_central.ec_config(p_key text default null, p_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if ervin_central.key_ok(p_key) then
    update ervin_central.devices set last_seen = now(), version = coalesce(left(p_version, 20), version)
     where key_hash = ervin_central.sha256_hex(p_key);
    return jsonb_build_object('scope', 'family')
      || coalesce((select jsonb_object_agg(name, data) from ervin_central.config), '{}');
  end if;
  return jsonb_build_object('scope', 'public', 'keyRejected', p_key is not null) || coalesce(ervin_central.public_config(), '{}');
end $$;

--
-- Carry over a device that was already in use before the lock (until settings.carry_over_until): it
-- proves it by its device id having sent ops, or by holding coin entries only the log could give it.

create or replace function ervin_central.ec_carry_over(p_device text, p_proof text[] default '{}', p_device_name text default null,
  p_me text default null, p_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ok boolean := false;
begin
  if current_date > coalesce((select v::date from ervin_central.settings where k = 'carry_over_until'), '2000-01-01') then
    return jsonb_build_object('ok', false);
  end if;
  if length(p_device) between 8 and 40 then
    ok := exists (select 1 from ervin_central.ops o where o.device = p_device);
  end if;
  if not ok and coalesce(cardinality(p_proof), 0) between 1 and 10 then
    ok := exists (select 1 from ervin_central.ops o
      where o.op->'entry'->>'id' = any(p_proof) or o.op->>'entryId' = any(p_proof));
  end if;
  if not ok then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'key', ervin_central.mint_device(p_device, p_device_name, p_me, 'carried over', p_version));
end $$;

--
-- Set up a new device with a parent's or the kids' 4-digit code. 5 wrong tries per device per 15 min,
-- 20 wrong tries in total per hour. Both parents get a push when a device is added.

create or replace function ervin_central.ec_enroll(p_device text, p_pin text, p_device_name text default null,
  p_me text default null, p_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pc  jsonb := (select data->'passcodes' from ervin_central.config where name = 'family');
  h   text;
  who text;
  k   text;
begin
  if (select count(*) from ervin_central.unlock_attempts a where not a.ok and a.device = p_device and a.at > now() - interval '15 minutes') >= 5
     or (select count(*) from ervin_central.unlock_attempts a where not a.ok and a.at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'wait');
  end if;
  if coalesce(p_pin, '') ~ '^[0-9]{4}$' then
    h := ervin_central.sha256_hex('ervin-central:' || p_pin);
    who := case h when pc->>'dad' then 'dad' when pc->>'mom' then 'mom' when pc->>'kids' then 'kids' end;
  end if;
  insert into ervin_central.unlock_attempts (device, ok) values (left(p_device, 40), who is not null);
  if who is null then return jsonb_build_object('ok', false, 'error', 'wrong'); end if;
  k := ervin_central.mint_device(p_device, p_device_name, p_me, who || ' code', p_version);
  begin
    perform ervin_central.push_send(
      (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]') from ervin_central.push_subs s),
      jsonb_build_object('title', 'New device on Ervin Central',
        'body', coalesce(nullif(p_device_name, ''), 'A device') || ' was set up with '
          || case who when 'kids' then 'the kids’ code' when 'dad' then 'Dad’s code' else 'Mom’s code' end
          || '. Not you? Tell Matt.',
        'tag', 'device-' || left(k, 8), 'url', './#/admin'));
  exception when others then raise warning 'ec_enroll push: %', sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'key', k, 'who', who);
end $$;

-- Log rows past `p_after`, oldest first (store.js replays them).
create or replace function ervin_central.ec_ops(p_key text, p_after bigint default 0, p_limit int default 1000)
returns table (seq bigint, op_id text, bin text, op jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform ervin_central.require_key(p_key);
  return query select o.seq, o.op_id, o.bin, o.op from ervin_central.ops o
    where o.seq > coalesce(p_after, 0) order by o.seq limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end $$;

-- Append ops; a retried op_id is ignored, so a resend can't double-pay. Kept in the order sent.
create or replace function ervin_central.ec_add_ops(p_key text, p_device text, p_ops jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ervin_central.require_key(p_key);
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then raise exception 'bad ops'; end if;
  insert into ervin_central.ops (op_id, bin, op, device, entered_by, device_name)
  select x.e->>'op_id', x.e->>'bin', x.e->'op', left(p_device, 40), left(x.e->>'entered_by', 10), left(x.e->>'device_name', 40)
    from jsonb_array_elements(p_ops) with ordinality as x(e, n)
   order by x.n
  on conflict (op_id) do nothing;
end $$;

-- The readable chore log (Parent management → Who did what).
create or replace function ervin_central.ec_log(p_key text, p_kid text default null, p_limit int default 100)
returns setof ervin_central.chore_log
language plpgsql stable security definer set search_path = '' as $$
begin
  perform ervin_central.require_key(p_key);
  return query select * from ervin_central.chore_log l
    where p_kid is null or l.kid = p_kid order by l.seq desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- Notifications, behind the key (they wrap the push_* functions above).
create or replace function ervin_central.ec_push_subscribe(p_key text, p_endpoint text, p_p256dh text, p_auth text, p_house text, p_device_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin perform ervin_central.require_key(p_key); perform ervin_central.push_subscribe(p_endpoint, p_p256dh, p_auth, p_house, p_device_name); end $$;
create or replace function ervin_central.ec_push_unsubscribe(p_key text, p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin perform ervin_central.require_key(p_key); perform ervin_central.push_unsubscribe(p_endpoint); end $$;
create or replace function ervin_central.ec_push_house(p_key text, p_endpoint text) returns text
language plpgsql security definer set search_path = '' as $$
begin perform ervin_central.require_key(p_key); return ervin_central.push_house(p_endpoint); end $$;
create or replace function ervin_central.ec_push_test(p_key text, p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin perform ervin_central.require_key(p_key); return ervin_central.push_test(p_endpoint); end $$;

-- ---- Admin (Matt's Mac: scripts/publish.mjs and scripts/devices.mjs) ----
create or replace function ervin_central.ec_publish(p_admin text, p_name text, p_data jsonb) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform ervin_central.require_admin(p_admin);
  if (select data from ervin_central.config where name = p_name) is not distinct from p_data then return 'unchanged'; end if;
  insert into ervin_central.config (name, data, updated_at) values (p_name, p_data, now())
    on conflict (name) do update set data = excluded.data, updated_at = now();
  insert into ervin_central.config_history (name, data) values (p_name, p_data);
  return 'published';
end $$;

create or replace function ervin_central.ec_devices(p_admin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform ervin_central.require_admin(p_admin);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', left(d.key_hash, 8), 'device', d.device, 'name', d.device_name, 'me', d.me,
    'how', d.how, 'version', d.version, 'created', d.created_at, 'lastSeen', d.last_seen, 'revoked', d.revoked_at) order by d.created_at), '[]')
    from ervin_central.devices d);
end $$;

-- Revoke a device by the 8-character id ec_devices shows. That device drops to the public slice.
create or replace function ervin_central.ec_revoke(p_admin text, p_id text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform ervin_central.require_admin(p_admin);
  if length(p_id) < 8 then raise exception 'use the 8-character id'; end if;
  update ervin_central.devices set revoked_at = now() where key_hash like p_id || '%' and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

do $$ begin
  revoke execute on function ervin_central.ec_config(text, text), ervin_central.ec_carry_over(text, text[], text, text, text),
    ervin_central.ec_enroll(text, text, text, text, text), ervin_central.ec_ops(text, bigint, int), ervin_central.ec_add_ops(text, text, jsonb),
    ervin_central.ec_log(text, text, int), ervin_central.ec_push_subscribe(text, text, text, text, text, text),
    ervin_central.ec_push_unsubscribe(text, text), ervin_central.ec_push_house(text, text), ervin_central.ec_push_test(text, text),
    ervin_central.ec_publish(text, text, jsonb), ervin_central.ec_devices(text), ervin_central.ec_revoke(text, text) from public;
  grant execute on function ervin_central.ec_config(text, text), ervin_central.ec_carry_over(text, text[], text, text, text),
    ervin_central.ec_enroll(text, text, text, text, text), ervin_central.ec_ops(text, bigint, int), ervin_central.ec_add_ops(text, text, jsonb),
    ervin_central.ec_log(text, text, int), ervin_central.ec_push_subscribe(text, text, text, text, text, text),
    ervin_central.ec_push_unsubscribe(text, text), ervin_central.ec_push_house(text, text), ervin_central.ec_push_test(text, text),
    ervin_central.ec_publish(text, text, jsonb), ervin_central.ec_devices(text), ervin_central.ec_revoke(text, text) to anon, authenticated;
end $$;

insert into ervin_central.settings (k, v) values ('carry_over_until', '2026-11-30') on conflict (k) do nothing;

notify pgrst, 'reload schema';

-- Admin token (scripts/admin.mjs reads it from the macOS keychain item "ervin-central-admin"); only
-- its hash is stored, set by hand:
--   insert into ervin_central.settings (k, v) values ('admin_token_hash', '<sha256 hex of the token>')
--     on conflict (k) do update set v = excluded.v;

-- ---- The lock itself (applied 2026-10-11, once the new site was live) -------------------------
-- The API no longer reads or writes the log directly, and the old open push functions are gone from
-- the API; devices go through the ec_* functions above with their key.
drop policy if exists "family can read ops" on ervin_central.ops;
drop policy if exists "family can add ops" on ervin_central.ops;
revoke all on ervin_central.ops from anon, authenticated;
revoke all on ervin_central.chore_log from anon, authenticated;
revoke usage, select on all sequences in schema ervin_central from anon, authenticated;
revoke execute on function ervin_central.push_subscribe(text, text, text, text, text), ervin_central.push_unsubscribe(text),
  ervin_central.push_house(text), ervin_central.push_test(text) from public, anon, authenticated;
-- push_gone stays callable: the Edge Function reports dropped subscriptions with the gone_token.

notify pgrst, 'reload schema';

-- ---- Verification (expected: rowsecurity=true and every anon privilege false — anon only calls ec_*) ---
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
--      publishable key sb_publishable_JSzTVUs3AyUFBI5wmTmUpA_meMYDSIr (public-safe; in data/site.json)
--      secret key: dashboard only — never in the repo
-- =====================================================================================
