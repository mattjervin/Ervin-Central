# Ervin Central

The Ervin family's digital signage — a calendar, school info (lunch menus for both girls), a
chore chart, and **Kindness Coins** for doing chores and extra household tasks.

Built as a plain static website so it runs on the kids' iPads and iPhones today and on a
wall-mounted touch screen later.

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
4-day forecast and countdowns follow; the coin leaderboard and chore chart sit at the bottom.

## Pages

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Home** | Landscape banner (greeting, clock, weather), **Today** per girl (school, specials, activities, lunch) + tomorrow, **Tonight** (where the girls sleep + the week of nights), **Coming up**, 4-day weather, countdowns, leaderboard, tap-to-finish chores | Everything below |
| **Calendar** | Agenda, rolling Week and Month views, filterable by kid, with school hours, early-outs, specials and weather | `data/calendar.json` + `data/school.json` |
| **School** | Hours, specials, and the week's lunch/breakfast menu per girl | `data/school.json` + ADM's LINQ Connect menus |
| **Chores** | Big tap tiles by morning / after school / evening, a *This week* set, and extra chores | `data/chores.json` |
| **Coins** | Each girl's Dad's and Mom's jars, 7-day earnings, reward shop, parent approvals, history | The shared cloud ledger (Supabase) |

## Editing the family data

All content is hand-edited JSON in `data/` — no code changes needed:

- **`family.json`** — kids (name, emoji, color, school), `birthdays` (the girls are pinned to Countdowns; everyone else competes for the other slots), location for weather plus `location.sun` (average Des Moines sunrise/sunset per month, which drives the Home sky), kiosk settings.
- **`calendar.json`** — `holidays` as yearly rules (`"12-25"`, `"4th-thu-11"`, `"last-mon-05"`, `"easter"`, `"election"`; lunar ones list `dates`) so they never run out — `countdown: true` = eligible for Countdowns; `sleep` (the Dad's/Mom's night pattern + `overrides` for swaps and holidays), `recurring` weekly items (with `except` dates; `schoolDays: true` skips breaks), one-off `events` (`kind: "game"`, `tentative`). `who` is a list of kid ids; empty means the whole family.
- **`school.json`** — school hours, early-out weekdays, specials, and the school-year dates: `noSchool` (breaks, workdays) and `extraEarlyOut` (non-Friday early outs like conferences), each `{ date, label }`, copied from the ADM academic calendar PDF (`year.source`). Replace them each summer when ADM posts the next year.
- **`chores.json`** — `daily` chores (with `who`, `days`, `part`), `weekly` chores, `extra` chores (`parentOnly` = a parent gives it, like a kindness catch), `rewards`, and their coin values. Keep ids stable; the coin history refers to them.
- **`wear.json`** — the *What to wear* rules under the Home banner (T-shirt / long sleeves / sweater, shorts or pants, light jacket to peel off, warm or winter coat, rain jacket, snow gear, sunscreen), keyed on the day's feels-like high and low, rain chance, snow and wind. First matching rule per group wins; after 3pm it shows tomorrow's.
- **`menus.json`** — generated; don't edit. The weekly calendar sync refreshes it from Matt's Mac (LINQ blocks GitHub's servers, so the Action is manual-only).

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
- Balances are always the sum of the ledger, so every coin can be traced to a chore or approval.
  Entries from before the houses existed count toward Dad's jar.

**Passcodes** live in `data/family.json → passcodes` as SHA-256 hashes (salted with
`ervin-central:`), so they aren't sitting in the public source as plain digits. That keeps honest
kids honest; it is not real security. To change one, hash the new code and paste it in:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('ervin-central:1234').digest('hex'))"
```

### Parent management (`#/admin`)

Tap **Parent management** at the bottom of any page (or bookmark `…/Ervin-Central/admin/`) and enter your code. Each parent manages their own house's jars: approvals waiting on them, quick ±, a kindness catch, coins spent offline, zero out. Dad's code (`passcodes.siteTools`) also gets sync, backup and wipe. While unlocked, **⚙︎** also shows in the top bar. The ↻ button top right re-downloads every file and reloads — for home-screen shortcuts stuck on an old version:

- **Spent offline** — record coins the girls spent in real life, with a reason (quick 5/10/20/50/All).
- **Zero out** — adds one "cashed in" line that brings that house's jar to exactly 0; history stays.
- **Wipe all history** — erases that girl's coins, requests and check-offs on every device.
- Remove single ledger lines, back up / restore (restore merges, never doubles).
- **Sync** — cloud status, *Sync now*, and *Rebuild from cloud* (throws away this device's copy
  and replays the whole log).

## Shared state — Supabase (cloud log)

Coins, check-offs and approvals sync through **Supabase**: project **ervin-data** (org *Ervin*,
Free plan, US East 2), schema **`ervin_central`**, table **`ops`**. The URL and the *publishable*
key are in `data/family.json → sync` — the publishable key is meant to be public; the **secret**
key must never go in this repo.

`ops` is an **append-only log**: every change (tick, untick, request, approve, zero, wipe…) is one
row `{ seq, op_id, bin, op }`. Each device replays the log in `seq` order to rebuild every girl's
ledger, so all devices land on the same balances and nothing is ever overwritten. The table only
allows **read and insert** — nobody can edit or delete history through the API, and a wipe is just
another row (the record stays in the log).

- A tap is applied on screen at once, queued in an on-device outbox, and POSTed with an `op_id`
  minted up front. A retry of an op that already landed is ignored (unique `op_id`), so it can't
  double-pay. Offline devices catch up when they reconnect.
- Each visible screen checks for other devices' changes every `sync.pollSeconds` (15s) by reading
  only rows past the last `seq` it saw — a tiny request.
- **No per-device setup.** Any browser that opens the site is synced.
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
evening while the Claude app is open:

1. `node scripts/kids-calendar.mjs` reads the Kids calendar (JXA), expands repeating events and
   prints only what changed since the last sync. The full dump stays in `.cache/` (gitignored).
2. The task copies schedule-level changes into `data/calendar.json` (never addresses, medical,
   counseling, legal, or custody-handoff details), runs the tests, commits and pushes.
3. `node scripts/kids-calendar.mjs --accept` marks that state as synced.
4. It also re-checks ADM's academic calendar PDF. If ADM changes it, it updates `school.json` and
   runs `osascript -l JavaScript scripts/adm-to-kids-calendar.js "$(cat data/school.json)"`, which
   adds the district's no-school days and early dismissals to the Kids calendar (skipping ones
   already there).
5. `node scripts/fetch-menus.mjs` refreshes the cached lunch menus (LINQ posts ~2 months ahead).

Run the same steps by hand any time. Calendar.app is slow to script, so step 1 takes a few minutes.

## Tests

```bash
node --test 'tests/*.test.mjs'
```

Node's built-in runner, no packages: holiday rules, ADM school days, the sleep pattern,
countdowns, sunrise/sunset, weather → sky, ledger op idempotency, and cloud-log replay.

## Kiosk behavior

- Returns to Home after `kiosk.idleReturnSeconds` without a touch, and relocks parent mode.
- Holds a screen wake lock where the browser supports it.
- Repaints at midnight so the day's chores reset.
- On iPad/iPhone: Safari → Share → **Add to Home Screen** for a full-screen app.
  For a dedicated wall iPad, turn on **Guided Access** to pin it to this app.

## Running locally

No build step. Any static server works:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. Refresh menus manually with `node scripts/fetch-menus.mjs`.

## Privacy

The site is public but asks search engines not to index it (`robots.txt` + `noindex`). It
shows first names, schools and schedules — deliberately no teacher names, pickup numbers,
addresses, medical info or contact details. Keep it that way when adding data.

## Layout

```
index.html            Shell: rail/tab bar, top bar, modal + toast roots
css/app.css           Design tokens, components, motion, iPad/iPhone breakpoints
js/app.js             Router, clock, kiosk behaviors
js/data.js            Config loading, schedule engine, chores, menus, weather
js/store.js           Chore check-offs, coin ledger, approvals; Supabase log sync + outbox
js/linq.js            LINQ Connect menu client (shared by browser + Action)
js/ui.js              Hero/card/header/stat/pill/ring components, modal, toast, passcode pad
js/scene.js           Home's landscape (SVG): sun/moon on this month's sunrise–sunset, live weather
js/views/*.js         One module per page: render() → HTML, mount() → events (admin.js = #/admin)
data/*.json           Family-editable content
scripts/fetch-menus.mjs       Menu cache (run weekly by the sync task; menus.yml is a manual fallback)
scripts/kids-calendar.mjs     Kids calendar → change report for the weekly sync
scripts/adm-to-kids-calendar.js   ADM no-school days → Kids calendar
tests/*.test.mjs      node --test checks
```
