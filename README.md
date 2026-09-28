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
| **Chores** | Big tap tiles by morning / after school / evening; bonus tasks | `data/chores.json` |
| **Coins** | Balances, 7-day earnings, reward shop, parent approvals, history | The on-device ledger |

## Editing the family data

All content is hand-edited JSON in `data/` — no code changes needed:

- **`family.json`** — kids (name, emoji, color, school), `birthdays` (the girls are pinned to Countdowns; everyone else competes for the other slots), location for weather plus `location.sun` (average Des Moines sunrise/sunset per month, which drives the Home sky), kiosk settings.
- **`calendar.json`** — `holidays` as yearly rules (`"12-25"`, `"4th-thu-11"`, `"last-mon-05"`, `"easter"`, `"election"`; lunar ones list `dates`) so they never run out — `countdown: true` = eligible for Countdowns; `sleep` (the Dad's/Mom's night pattern + `overrides` for swaps and holidays), `recurring` weekly items (with `except` dates; `schoolDays: true` skips breaks), one-off `events` (`kind: "game"`, `tentative`). `who` is a list of kid ids; empty means the whole family.
- **`school.json`** — school hours, early-out weekdays, specials, and the school-year dates: `noSchool` (breaks, workdays) and `extraEarlyOut` (non-Friday early outs like conferences), each `{ date, label }`, copied from the ADM academic calendar PDF (`year.source`). Replace them each summer when ADM posts the next year.
- **`chores.json`** — daily chores (with `who`, `days`, `part`), bonus tasks, rewards and their coin values.
- **`wear.json`** — the *What to wear* rules under the Home banner (T-shirt / long sleeves / sweater, shorts or pants, light jacket to peel off, warm or winter coat, rain jacket, snow gear, sunscreen), keyed on the day's feels-like high and low, rain chance, snow and wind. First matching rule per group wins; after 3pm it shows tomorrow's.
- **`menus.json`** — generated; don't edit. The weekly calendar sync refreshes it from Matt's Mac (LINQ blocks GitHub's servers, so the Action is manual-only).

## How Kindness Coins work

- Ticking a daily chore gives its coins **immediately**; unticking takes them back.
- **Bonus tasks** ("Unload the dishwasher") and **rewards** ("Pick what's for dinner") go into a
  *Waiting for a parent* queue on the Coins page.
- Approving and adjusting need the **parent PIN** (asked for when you tap an approval, or open
  `…/Ervin-Central/admin/`). The first unlock asks you to create one; it's shared across devices once JSONBin is connected. Parent mode relocks after 5 min.
- Balances are always the sum of the ledger, so every coin can be traced to a chore or approval.

### Parent Admin (`#/admin`)

Go to `…/Ervin-Central/admin/` (bookmark it on a parent's phone) and unlock with the PIN. While unlocked, **⚙︎ Admin** also shows in the top bar. The ↻ button top right re-downloads every file and reloads — for home-screen shortcuts stuck on an old version:

- **Spent offline** — record coins the girls spent in real life, with a reason (quick 5/10/20/50/All).
- **Zero out coins** — adds one "cashed in" line that brings the balance to exactly 0; history stays.
- **Wipe all history** — erases that girl's coins, requests and check-offs on every device.
- Remove single ledger lines, change the PIN, back up / restore (restore merges, never doubles).
- **Sync** — connect this device to JSONBin or share a setup link to another device.

## Shared state — JSONBin

Coins sync across devices through a JSONBin **collection** named *Ervin Central* with three
private bins: **Household** (the parent PIN), **Evelynn** and **Avery**. One bin per girl keeps
two iPads saving at the same time from colliding. Every change is queued on the device and
replayed onto the latest copy of the bin before saving, so one device never overwrites
another's coins, and a device that's offline catches up when it reconnects.

### One-time setup

1. In JSONBin → **API Keys**, copy your **X-Master-Key**.
2. Also there, create an **Access Key** with only **Bins → Read** and **Bins → Update**
   (no Create/Delete, no Collections). Name it "Ervin Central site".
3. On your Mac:
   ```bash
   cd ~/Projects/ervin-central
   JSONBIN_MASTER_KEY='…' JSONBIN_ACCESS_KEY='…' node scripts/setup-jsonbin.mjs
   ```
   It creates the collection and bins, saves the ids to `jsonbin/bins.local.json` (not
   committed), and prints a **setup link**.
4. Open that link on each family device (AirDrop or text it to yourself). Enter or create the
   PIN and the device is connected. The green dot in the top bar means synced; amber is saving,
   red is a problem (tap ⚙︎ Admin for details).

Prefer the dashboard? Create the collection and three bins by hand using `jsonbin/*.json` as the
contents, then enter the access key and bin ids under Admin → Sync → "enter the keys by hand".

**The master key is never used by the website.** The access key lives only on family devices
(via the setup link), never in this public repo. Anyone holding the access key could edit coin
bins, so don't post the setup link anywhere public.

**Request budget:** each visible screen checks for changes every `sync.pollSeconds` (60s) and
reads all three bins — 3 requests/minute while the screen is on (~4,300/day for a screen that never
sleeps), plus 2 per tap. Raise `pollSeconds` in
`data/family.json` if your JSONBin plan's request allowance runs tight.

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
countdowns, sunrise/sunset, weather → sky, and ledger op idempotency.

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
js/store.js           Chore check-offs, coin ledger, approvals; JSONBin sync + outbox
js/linq.js            LINQ Connect menu client (shared by browser + Action)
js/ui.js              Hero/card/header/stat/pill/ring components, modal, toast, PIN pad
js/scene.js           Home's landscape (SVG): sun/moon on this month's sunrise–sunset, live weather
js/views/*.js         One module per page: render() → HTML, mount() → events (admin.js = #/admin)
jsonbin/*.json        Starting contents for the three bins
scripts/setup-jsonbin.mjs   Creates the JSONBin collection + bins, prints the setup link
data/*.json           Family-editable content
scripts/fetch-menus.mjs       Menu cache (run weekly by the sync task; menus.yml is a manual fallback)
scripts/kids-calendar.mjs     Kids calendar → change report for the weekly sync
scripts/adm-to-kids-calendar.js   ADM no-school days → Kids calendar
tests/*.test.mjs      node --test checks
```
