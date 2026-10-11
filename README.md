# Ervin Central

The Ervin family's digital signage — a calendar, school info (lunch menus for both girls), a
chore chart, and **Kindness Coins** for doing chores and extra household tasks.

Built as a plain static website so it runs on the kids' iPads and iPhones today and on a
wall-mounted touch screen later. The code is public; the family's data is not — see
[Who can see what](#who-can-see-what).

**Look & feel.** Built on the Catan companion's design system, recast in green: Cinzel
headlines with a shimmering gradient key word, mono eyebrow labels, glass cards, choice pills,
stat tiles with one hero tile, hexagon avatars and a fading hex-grid background. Motion is part of
the design: a sticky top nav whose active pill slides between tabs and tightens as you scroll,
drifting ambient light and fireflies, staggered card entrances, count-up numbers, spring
check-offs, and a Home landscape where the sun and moon track the real time of day.

**Phone first.** Most viewing is on phones (the girls, Mom, Dad), so Home leads with a short live
landscape that carries the greeting, clock and weather ("64° · Cloudy"), then *What to wear* (from the feels-like forecast) and **Today**: each girl's
school hours or no-school reason, specials (👟 PE — sneakers), activities with a countdown to the
next one, lunch on school days, and a peek at tomorrow. Where the girls sleep, what's coming up, a
4-day forecast and countdowns follow. Chores and coins have their own page.

## Pages

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Home** | Landscape banner (greeting, clock, weather), **Today** per girl (school, specials, activities, lunch) + tomorrow, **Tonight** (where the girls sleep + the week of nights), **Coming up** (with *Full calendar*), 4-day weather, countdowns | Everything below |
| **Chores** | Tabs for each girl (Avery first), then one list of her chores by morning / after school / evening, *This week* and extras; parent approvals, the **Reward shop**, and **Total Coins** (each girl's Dad's and Mom's jars) | `chores.json` + the shared cloud ledger (Supabase) |
| **Calendar** (via *Full calendar* on Home) | Agenda, rolling Week and Month views, filterable by kid, with school hours, early-outs, specials and weather | `calendar.json` + `school.json` |
| **School** (via *School details* on Home) | Hours, specials, and the week's lunch/breakfast menu per girl | `school.json` + the district's LINQ Connect menus |
| **Grandparents Central** | The girls' games, shows and birthdays for the next year, with Map and *Add to my calendar* | The public slice of `calendar.json` |

The top bar is **Home** and **Chores** on phones; computers also get **Calendar** and **School**. Grandparents Central's shareable link is `…/Ervin-Central/grandparents/`.

## Who can see what

- **Family devices** (each holds its own random key, stored on the device; the database keeps only
  its hash) see everything.
- **Anyone else** — including the grandparents, with no key — sees only **Grandparents Central**: the
  girls' games, shows and birthdays and the public venues they're at. Every other page shows a lock
  page with **Set up this phone** and a link to Grandparents Central.
- Phones that were already in use on 2026-10-11 got their key automatically on their first open.
  A new phone: open the person's link (below), add it to the home screen, open the home-screen app and
  tap **Set up this phone** — then Dad's, Mom's or the kids' code. Both parents get a notification
  whenever a device is set up.
- `node scripts/devices.mjs` lists the devices; `node scripts/devices.mjs revoke <id>` turns one off
  (a lost phone). It can be set up again with a code.

The data itself lives in a **private repo** (`mattjervin/ervin-central-private`, checked out at
`private/`, which this repo ignores) and in Supabase. The schema and every function is in
[`supabase/ervin_central.sql`](supabase/ervin_central.sql).

## Editing the family data

All content is hand-edited JSON in `private/data/` (the private repo) — no code changes needed. After
an edit: `node scripts/publish.mjs` (sends it to Supabase; apps pick it up when next opened), then
commit and push the private repo.

- **`family.json`** — kids (name, emoji, color, school), `birthdays` (the girls are pinned to Countdowns; everyone else competes for the other slots), location for weather plus `location.sun` (average Des Moines sunrise/sunset per month, which drives the Home sky), kiosk settings.
- **`calendar.json`** — `holidays` as yearly rules (`"12-25"`, `"4th-thu-11"`, `"last-mon-05"`, `"easter"`, `"election"`; lunar ones list `dates`) so they never run out — `countdown: true` = eligible for Countdowns; `sleep` (the Dad's/Mom's night pattern + `overrides` for swaps and holidays), `recurring` weekly items (with `except` dates; `schoolDays: true` skips breaks), one-off `events` (`kind: "game"`, `tentative`). `who` is a list of kid ids; empty means the whole family.
- **`school.json`** — school hours, early-out weekdays, specials, and the school-year dates: `noSchool` (breaks, workdays) and `extraEarlyOut` (non-Friday early outs like conferences), each `{ date, label }`, copied from the district's academic calendar PDF (`year.source`). Replace them each summer when the district posts the next year.
- **`chores.json`** — `daily` chores (with `who`, `days`, `part`), `weekly` chores, `extra` chores (`parentOnly` = a parent gives it, like a kindness catch), `rewards`, and their coin values. Keep ids stable; the coin history refers to them.
- **`wear.json`** (public, in this repo's `data/`) — the *What to wear* rules under the Home banner (T-shirt / long sleeves / sweater, shorts or pants, light jacket to peel off, warm or winter coat, rain jacket, snow gear, sunscreen), keyed on the day's feels-like high and low, rain chance, snow and wind. First matching rule per group wins; after 3pm it shows tomorrow's.
- **`menus.json`** — generated; don't edit. The weekly calendar sync refreshes it from Matt's Mac (`node scripts/fetch-menus.mjs`, then publish).
- **`site.json`** (public, in this repo's `data/`) — where Supabase is: URL, the *publishable* key, poll interval, the public push key.

## How Kindness Coins work

- Each girl has **two jars: Dad's and Mom's**. Coins earned at a house go in that house's jar and
  are spent there; each house's parent OKs their own extras and rewards.
- Ticking a chore pays **immediately**: the kid types the **coin code** (asked *every* time a kid
  adds coins to herself), then picks **Dad's or Mom's**. Tonight's house is pre-picked from the sleep
  schedule (before noon, last night's). Unticking takes the coins back, no code needed.
- **Daily** chores count once a day, **weekly** chores once a week (Monday–Sunday), across both
  houses, so making the bed at Mom's and again at Dad's pays once.
- **Extra chores** ("Rake leaves") are once a day each: coin code, house, then *Waiting for a
  parent*. **Rewards** go into the same queue, paid from the jar the kid picks.
- **Parent management** (the button at the bottom of every page): Dad's code opens Dad's area, Mom's
  code opens Mom's. Parent mode relocks after 5 min, and while it's unlocked the coin code isn't
  asked and coins go to that parent's house.
- A coin is worth about **25¢**: daily chores are 1 coin, bigger weekly jobs 3–6, and rewards that
  cost real money are priced at 4 coins per dollar (**Cash out $10** = 40 coins).
- Balances are always the sum of the ledger, so every coin can be traced to a chore or approval.
  Entries from before the houses existed count toward Dad's jar.
- **Who did what**: every change records the girl, the house, the date, who entered it (kid code,
  Dad or Mom) and the device's name. Parent management shows it; in Supabase it's the
  `ervin_central.chore_log` view.

**Passcodes** live in `private/data/family.json → passcodes` as SHA-256 hashes (salted with
`ervin-central:`). Only family devices get them; setting up a new device checks the code on the
server, with a limit on wrong tries. To change one, hash the new code, paste it in and publish:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('ervin-central:1234').digest('hex'))"
```

### Parent management (`#/admin`)

Tap **Parent management** at the bottom of any page (or bookmark `…/Ervin-Central/admin/`) and enter your code. Each parent manages their own house's jars: approvals waiting on them, quick ±, a kindness catch, coins spent offline, zero out, plus **History** (every coin, both houses), **Who did what** (the chore log) and **This device** (the name it's logged under). Dad's code (`passcodes.siteTools`) also gets sync, backup and wipe. While unlocked, **⚙︎** also shows in the top bar. The ↻ button top right re-downloads every file and reloads — for home-screen shortcuts stuck on an old version:

- **Spent offline** — record coins the girls spent in real life, with a reason (quick 5/10/20/50/All).
- **Zero out** — adds one "cashed in" line that brings that house's jar to exactly 0; history stays.
- **Wipe all history** — erases that girl's coins, requests and check-offs on every device.
- Remove single ledger lines, back up / restore (restore merges, never doubles).
- **Sync** — cloud status, *Sync now*, and *Rebuild from cloud* (throws away this device's copy
  and replays the whole log).

## Shared state — Supabase (cloud log)

Coins, check-offs and approvals sync through **Supabase**: project **ervin-data** (org *Ervin*,
Free plan, US East 2), schema **`ervin_central`**, table **`ops`**. The URL and the *publishable*
key are in `data/site.json → sync` — the publishable key is meant to be public; the **secret**
key must never go in this repo. The API exposes no tables: devices go through `ec_*` functions that
check the device's key.

`ops` is an **append-only log**: every change (tick, untick, request, approve, zero, wipe…) is one
row `{ seq, op_id, bin, op }`. Each device replays the log in `seq` order to rebuild every girl's
ledger, so all devices land on the same balances and nothing is ever overwritten. Family devices
can only **read and append** — nobody can edit or delete history through the API, and a wipe is just
another row (the record stays in the log).

- A tap is applied on screen at once, queued in an on-device outbox, and POSTed with an `op_id`
  minted up front. A retry of an op that already landed is ignored (unique `op_id`), so it can't
  double-pay. Offline devices catch up when they reconnect.
- Each visible screen checks for other devices' changes every `sync.pollSeconds` (15s) by reading
  only rows past the last `seq` it saw — a tiny request.
- **One-time setup per device** (see [Who can see what](#who-can-see-what)); after that it just syncs.
- **History / audit:** Supabase dashboard → Table Editor → `ervin_central` → `ops`.
- **Schema:** [`supabase/ervin_central.sql`](supabase/ervin_central.sql) — the exact schema and grants; re-runnable.

**Moving off the old Gist (Oct 2026):** the first time each device opens this version, any coins it
still holds from the old GitHub Gist / on-device storage are uploaded once as a `merge` op
(idempotent by entry id, so two devices uploading the same coins never doubles them). A copy of the
old data stays on the device under `ervin-central:v2-backup`. The old gist was deleted on 2026-10-09
after a reconcile showed every line it held was accounted for.

## Calendar sync (weekly)

The site's calendar is copied from the **Kids** calendar in Calendar.app on Matt's Mac, minus
anything private. A scheduled Claude task, **Ervin Central calendar sync**, runs every Sunday
evening while the Claude app is open (the full rules are in the private repo's `CLAUDE.md`):

1. `node scripts/kids-calendar.mjs` reads the Kids calendar (JXA), expands repeating events and
   prints only what changed since the last sync. The full dump stays in `.cache/` (gitignored).
2. The task copies schedule-level changes into `private/data/calendar.json` (never home addresses, medical,
   counseling, legal, or custody-handoff details). Events keep a place name and field; a new public
   venue (park, sports complex, school) goes into `places` with its address, so Grandparents Central
   and away games get a Map button. It flags the girls' shows, tournaments and own parties for
   Grandparents Central.
3. `node scripts/grandparents-check.mjs` lists the next 120 days of Grandparents Central and flags
   events with no known venue or show-like events that aren't on it yet.
4. Tests run, `node scripts/publish.mjs` sends the data to Supabase, it commits and pushes the
   private repo, and `node scripts/kids-calendar.mjs --accept` marks that state as synced.
5. It also re-checks the district's academic calendar PDF. If it changes, it updates `school.json` and
   runs `osascript -l JavaScript scripts/adm-to-kids-calendar.js "$(cat private/data/school.json)"`, which
   adds the district's no-school days and early dismissals to the Kids calendar (skipping ones
   already there).
6. `node scripts/fetch-menus.mjs` refreshes the cached lunch menus (LINQ posts ~2 months ahead).

Run the same steps by hand any time. Calendar.app is slow to script, so step 1 takes a few minutes.

## Tests

```bash
node --test 'tests/*.test.mjs' 'private/tests/*.test.mjs'
```

Node's built-in runner, no packages. `tests/` holds the generic checks; the ones that read the family's
data (school days, the sleep pattern, Grandparents Central) are in the private repo's `tests/`. Covered: holiday rules, school days, the sleep pattern,
countdowns, sunrise/sunset, weather → sky, ledger op idempotency, and cloud-log replay.

## Home-screen links (whose device)

There are no logins. Each person gets their own link, and the app saved from it opens as them (a new
phone also needs the one-time **Set up this phone**, from inside the home-screen app):

| Person | Link |
|---|---|
| Evelynn | `https://mattjervin.github.io/Ervin-Central/evelynn/` |
| Avery | `https://mattjervin.github.io/Ervin-Central/avery/` |
| Dad | `https://mattjervin.github.io/Ervin-Central/dad/` |
| Mom | `https://mattjervin.github.io/Ervin-Central/mom/` |

Open the link in Safari on that person's phone → Share → **Add to Home Screen**. (An app that's
already on the home screen keeps its old start page: delete it and add it again from the link.) A
girl's app opens Chores on her list, greets her on Home and puts her day first. It's a starting point,
not a lock: Avery can still tap her own tab on Evie's phone. Parent management → **This device** shows
and changes it, and has a Share button for each link.

## Notifications

When a girl asks for an OK — an extra chore or a reward — that house's parent gets a notification.
Turn it on per device in Parent management → **Notifications** (on iPhone, from the home-screen app;
iOS 16.4+). Tapping it opens Parent management. Requests a parent enters themselves don't notify.
How it works: a database trigger on `ervin_central.ops` → the `ervin-central-push` Edge Function
(`supabase/functions/`) → Web Push → `sw.js`. The private push key lives only in Supabase.

## Always-on behavior

- No idle return to Home and no screen wake lock: the site is used on phones (`kiosk.keepAwake` can
  turn the wake lock back on for a wall display).
- Repaints at midnight so the day's chores reset.
- On iPad/iPhone: open your own link above in Safari → Share → **Add to Home Screen**.
  For a dedicated wall iPad, turn on **Guided Access** to pin it to this app.

## Running locally

No build step. Any static server works:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. Refresh menus manually with `node scripts/fetch-menus.mjs`.

## Privacy

The code and Grandparents Central are public (search engines are asked not to index them:
`robots.txt` + `noindex`); everything else needs a family device. Even the private data
deliberately holds no teacher names, pickup numbers, home addresses, medical info or contact
details — family devices cache it. Keep it that way when adding data.

## Layout

```
index.html            Shell: rail/tab bar, top bar, modal + toast roots
css/app.css           Design tokens, components, motion, iPad/iPhone breakpoints
js/app.js             Router, clock, kiosk behaviors
js/cloud.js           Supabase rpc + this device's key
js/data.js            Config loading (rpc ec_config), schedule engine, chores, menus, weather
js/store.js           Chore check-offs, coin ledger, approvals; Supabase log sync + outbox
js/linq.js            LINQ Connect menu client (shared by browser + scripts)
js/push.js            Parent notifications: subscribe / test / turn off (Web Push)
sw.js                 Service worker — shows notifications only, never caches
avery/ evelynn/ dad/ mom/   Each person's home-screen link (→ ?me=<id>, with manifest.<id>.webmanifest)
supabase/functions/   The ervin-central-push Edge Function
js/ui.js              Hero/card/header/stat/pill/ring components, modal, toast, passcode pad
js/scene.js           Home's landscape (SVG): sun/moon on this month's sunrise–sunset, live weather
js/views/*.js         One module per page: render() → HTML, mount() → events (admin.js = #/admin, lock.js = no key)
data/site.json        Where Supabase is (public)
data/wear.json        What-to-wear rules (public)
private/              The private repo: data/*.json (family data) + CLAUDE.md (family notes) — ignored here
scripts/publish.mjs   private/data → Supabase (admin token from the keychain)
scripts/devices.mjs   List / revoke family devices
scripts/fetch-menus.mjs       Menu cache (run weekly by the sync task)
scripts/kids-calendar.mjs     Kids calendar → change report for the weekly sync
scripts/adm-to-kids-calendar.js   District no-school days → Kids calendar
tests/*.test.mjs      node --test checks (generic; family-data checks are in private/tests/)
```
