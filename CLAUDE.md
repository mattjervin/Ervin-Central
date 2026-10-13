# Ervin Central — notes for Claude

@private/CLAUDE.md

Family digital-signage site for Matt's two daughters, Evelynn and Avery. Static site on GitHub Pages;
future target is a wall-mounted touch screen. This repo is PUBLIC: family specifics (schools, town,
custody, the calendar-sync rules) are in `private/CLAUDE.md`, imported above from the private repo
checked out at `private/` (gitignored here). Never copy them into this repo. Visual language follows
Matt's Catan companion (`~/Projects/catan/index.html`) recast in green — NOT ErvOS (Matt dropped that
direction). Layout ideas come from DAKboard family boards. Matt likes live motion and the sticky top
nav. The site is used on phones ~95% of the time — check every layout at phone width first.

## Public vs private (the lock, Matt, 2026-10-11)
- Only the code, `data/site.json` (where Supabase is) and `data/wear.json` are public. The family's
  data — `family`, `calendar`, `chores`, `school`, `menus` — lives in the private repo
  (`private/data/*.json`) and is published to Supabase (`ervin_central.config`) with
  `node scripts/publish.mjs`. The site loads it through rpc `ec_config` (`loadConfig()` in data.js).
- Every family device holds its own random key (localStorage `ervin-central:key`, js/cloud.js); the
  database keeps only its hash (`ervin_central.devices`). With a key: everything (`cfg.scope ===
  'family'`). Without one: only Grandparents Central's slice (`public_config()` in the SQL: the girls,
  their birthdays, games/shows via the same rule as `toItem()`, and public venues) and, on every
  other route, the lock page (`js/views/lock.js`).
- A device gets its key once: phones in use before the lock are carried over silently on their first
  open (`ec_carry_over`: its device id sent ops, or it holds coin-entry ids from the log; until
  `settings.carry_over_until` = 2026-11-30). A new phone is set up from the lock page with Dad's,
  Mom's or the kids' code, checked server-side (`ec_enroll`: 5 wrong tries per device per 15 min, 20
  per hour overall) — both parents get a push when that happens.
- Grandparents Central stays open to anyone with the link (Matt's call): the old
  `…/Ervin-Central/grandparents/` link keeps working with no key.
- `node scripts/devices.mjs` lists devices (who, how set up, version, last opened);
  `node scripts/devices.mjs revoke <id>` turns one off. The admin scripts read the admin token from
  the macOS keychain item `ervin-central-admin`; only its hash is in the database. Never print it.
- A device whose key is revoked drops its cached family data on the next open (`keyRejected`).

Top nav: on phones just two big buttons, Home and Chores (the girls' focus); computers (≥1024px,
`.desk-tab`) also get Calendar, School and Grandparents, plus ⚙︎ Parent management left of ↻ (on
phones ⚙︎ shows only while a parent is unlocked). On phones, Calendar is reached from Home's Coming Up
card ("Full calendar") and School from each girl's Today column. Parent management is in the footer.
Away events (a `places` venue outside family.json → location, i.e. not our town) get a small 🗺️ Map
pill on Home and the Calendar (`awayMap()` in ui.js); the parents know the local spots.

Coins live on the Chores page: a slim kid tab bar (Avery first, `chores.json → kidOrder`; no
"Everyone"; each tab shows her coin total) that sticks under the top nav and, once stuck, drops down
the picked girl's day (% done, coins today, this week, both jars); then one list for the picked girl
(today by part of day, this week, extras), approvals, the Reward shop (page-sized title like "Chore
chart"), and **Total Coins** at the bottom (fixed order, no ranks — it's a total, not a race). At the
very bottom, "How <girl> got her coins": her own read-only history, so a parent's note on custom coins
(Parent management → Custom coins) shows up for her. The full ledger with ✕ lives in Parent management.
Passcode pads take keyboard digits / Backspace / Esc on computers. Coins are drawn with `coin()` in ui.js (a gold
Mario-style coin); never use the 🪙 emoji, which is silver on Apple devices.

Grandparents Central (`#/grandparents`, `js/views/grandparents.js`) is a page Matt sends his dad: the
girls' games, shows, birthdays and their own birthday parties for the next year, with "add to my calendar"
(.ics) buttons. Its way in is the link at the bottom of the full calendar; on that page the tabs,
⚙︎ and footer are hidden. Its shareable address is
`…/Ervin-Central/grandparents/` (`grandparents/index.html` forwards to `#/grandparents` and carries
the link-preview tags); the Share button sends that, built by `shareUrl()` — never from
`location.href.split('?')`, which drops the #fragment after a `?r=` refresh.

Whose device: each person has a home-screen link — `…/Ervin-Central/avery/`,
`/evelynn/`, `/dad/`, `/mom/` — that forwards to `?me=<id>`; `index.html` then picks
`manifest.<id>.webmanifest` (its `start_url` keeps `?me=`), so the saved app always opens as that
person (`me()` / `meFromLink()` in data.js, stored per device in localStorage; applied only once the
device is a family device). A girl's device opens Chores on her list, Home greets her and puts her
Today column first, and the device's default log name is "Evelynn’s iPhone". It's a starting point,
not a lock: the other girl's tab still works, and Parent management → This device changes it (sticks
until a different person's link is opened). These links say whose device it is; the device key is
what lets it see anything. On iPhone the home-screen app has its own storage, separate from Safari,
so a new phone is set up from inside the home-screen app. No idle return to Home and no wake lock —
the site lives on phones (Matt, 2026-10-11).

Notifications (Matt, 2026-10-11): when a girl asks for an OK (an extra chore or a reward — an `ops`
row with `t = 'request'`), the parent of that house gets a Web Push on each device where they turned
it on (Parent management → Notifications; on iPhone only from the home-screen app). Path: trigger
`ervin_central.notify_request()` → `push_send()` (pg_net) → Edge Function `ervin-central-push`
(`supabase/functions/`, verify_jwt off, relays only for our VAPID key) → `sw.js` shows it; tapping
opens Parent management. Skipped when that parent entered the request themselves. The site
subscribes through `ec_push_*` (behind the device key). The VAPID public key is in `data/site.json →
sync.vapidPublicKey`; the private key lives only in `ervin_central.push_config` (never in the repo).
`sw.js` must never get a fetch handler — the version.json auto-update relies on the network.

## Rules
- No build step, no framework, no npm dependencies. ES modules loaded directly by the browser.
- Every interpolated value in a view goes through `esc()`.
- Touch first: tap targets ≥ 44px (primary actions 48px+). No hover-only affordances.
- Colors: green (`--acc`) = the whole family / both girls / generic (weather, what to wear, lunch —
  it's the same menu at both schools, the day type, holidays). Evelynn orange (her avatar is an orange
  butterfly, `assets/butterfly-orange.svg`), Avery yellow. Dad blue and Mom pink appear only on
  where-they-sleep UI and the house coin jars / house tags; the Tonight card takes tonight's parent
  color. Coins are gold.
- No streaks (Matt, 2026-10-11): with two houses a broken streak feels unfair.
- Entrance animations run only when arriving on a page (`.view.settled` disables them on tap re-renders). Respect `prefers-reduced-motion`.
- Content changes go in `private/data/*.json`, not code, then `node scripts/publish.mjs` and commit +
  push the private repo. Never add family data to this repo (no new files in `data/` except public,
  generic ones; a test checks).
- When you change JS or CSS, bump the `?v=` on `app.js` and `app.css` in `index.html` AND `version.json`
  (a test checks they match). Home-screen shortcuts on the girls' iPhones cache hard: open apps see the
  new version.json within ~5 min (or on reopen) and refresh themselves; ↻ (top right) does it by hand.
- Privacy: never add teacher names, pickup numbers, home/party addresses, phone numbers, medical,
  counseling or legal details — not even to the private data, which family devices cache. The sleep
  schedule shows only "Dad's" / "Mom's" — never names or addresses. Exception Matt OK'd (2026-10-11):
  street addresses of PUBLIC venues (parks, schools, sports complexes, theaters) live in
  `calendar.json → places`, so Grandparents Central can show them with a Directions link (Apple Maps
  on Apple devices, Google Maps elsewhere — `mapsUrl()` in data.js) and put them in the .ics. Events
  keep just a place name ("Island Park · Field 4A") and match a venue by its `match` text. Never add a
  home (a party at someone's house keeps only a place name). Grandparents Central's slice is public.
- Run `node --test 'tests/*.test.mjs' 'private/tests/*.test.mjs'` after touching `js/data.js`, `js/scene.js` or `js/store.js`.
  Generic checks live in `tests/` (public); anything that asserts the family's data (dates, the sleep
  pattern, events, names) goes in `private/tests/family.test.mjs`, never in the public tests.
- Coin balances are derived from the ledger in `store.js`; never store a balance. Each girl has a jar
  per house: every entry and request carries `house` ('dad' | 'mom', the sleep schedule's places);
  entries without one count as Dad's. Chores: `daily` once a day, `weekly` once a week (Mon–Sun, keyed
  on that Monday via `periodKey()`), `extra` once a day with that house's parent's OK — limits count
  across both houses and are enforced in `apply()` so every device agrees. A coin is worth about 25¢
  (`chores.json → coinValue`): dailies are 1 coin, bigger jobs pay more, and rewards that cost real
  money are priced at 4 coins per dollar for one kid; bigger family outings are priced for 1.5 kids
  (one kid's cost × 6 — the sister usually tags along), and meals count only what they cost beyond a
  home dinner (Matt, 2026-10-13).
- Who did what: every op row carries `entered_by` ('kid' | 'dad' | 'mom' — `store.init(…, { who })`)
  and `device_name` (named in Parent management, stored per device). The view
  `ervin_central.chore_log` flattens the log into readable rows; Parent management → "Who did what"
  reads it via `store.log()` (rpc `ec_log`). Schema changes go in `supabase/ervin_central.sql` too.
- State syncs through Supabase (project `ervin-data`, ref `gflocxcogragbwjplwgt`, schema
  `ervin_central`, table `ops`) — an append-only log `{ seq, op_id, bin, op }` that every device
  replays in `seq` order (`replay()` in store.js). All mutations are serializable ops through
  `apply()` — keep them idempotent and deterministic given the log order (mint ids up front; a
  retry with the same `op_id` is ignored by the unique index). Devices read and append only through
  `ec_ops` / `ec_add_ops`, which check the device key. anon has NO table or view grants in
  `ervin_central` — only `execute` on the `ec_*` functions (and `push_gone` for the Edge Function).
  Never add table grants, and never UPDATE/DELETE through the API; a correction is a new op. Every new
  function: `security definer set search_path = ''`, check the key (`require_key`) first, revoke from
  public and grant to anon explicitly.
- URL + **publishable** key live in `data/site.json → sync` (safe to be public). Never commit the
  secret key.
- Passcodes (`private/data/family.json → passcodes`, SHA-256 of `ervin-central:<code>`): `dad` / `mom`
  open that parent's Parent management (their house's jars; `requireParent(house)` for approvals), and
  `siteTools` names whose code also gets sync/backup/wipe; `kids` is asked EVERY time a kid adds coins
  (then she picks the house) via `kidEarns()` in ui.js — both skipped while a parent is unlocked, whose
  house gets the coins. Untick needs no code. Never write the codes themselves anywhere.
- Schema changes: run SQL in the Supabase SQL Editor (or the Supabase MCP server with
  `project_ref=gflocxcogragbwjplwgt`). Setup + how-to-add-an-app notes live in Matt's Second Brain
  (`AI & Tools/Supabase — Personal App Backend.md`).
- Views export `title`, `render(params)` → HTML string, optional `mount(el, rerender)`. The
  router hands `mount` a fresh element each render, so binding listeners there is safe. Views other
  than Grandparents Central can assume `isFamily()`; Grandparents Central must work on the public
  slice (no `cfg.school`, `cfg.chores` or sleep schedule).

## LINQ menus
`api.linqconnect.com/api/FamilyMenu` is public with `Access-Control-Allow-Origin: *`, but its WAF
403s requests without a real browser User-Agent (browsers are fine; scripts send one). District
and building ids are in `private/data/school.json`.
