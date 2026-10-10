# Ervin Central — notes for Claude

Family digital-signage site for Matt's two daughters (Evelynn, Meadow View Elementary; Avery,
Adel Elementary — ADM Community Schools, Adel IA). Static site on GitHub Pages; future target is
a wall-mounted touch screen. Visual language follows Matt's Catan companion
(`~/Projects/catan/index.html`) recast in green — NOT ErvOS (Matt dropped that direction). Layout
ideas come from DAKboard family boards. Matt likes live motion and the sticky top nav.

## Rules
- No build step, no framework, no npm dependencies. ES modules loaded directly by the browser.
- Every interpolated value in a view goes through `esc()`.
- Touch first: tap targets ≥ 44px (primary actions 48px+). No hover-only affordances.
- Colors: green (`--acc`) = the whole family / both girls / generic (weather, what to wear, lunch —
  it's the same menu at both schools, the day type, holidays). Evelynn orange (her avatar is an orange
  butterfly, `assets/butterfly-orange.svg`), Avery yellow. Dad blue and Mom pink appear only on
  where-they-sleep UI and the house coin jars / house tags; the Tonight card takes tonight's parent
  color. Coins are gold.
- Entrance animations run only when arriving on a page (`.view.settled` disables them on tap re-renders). Respect `prefers-reduced-motion`.
- Content changes go in `data/*.json`, not code.
- When you change JS or CSS, bump the `?v=` on `app.js` and `app.css` in `index.html` AND `version.json`
  (a test checks they match). Home-screen shortcuts on the girls' iPhones cache hard: open apps see the
  new version.json within ~5 min (or on reopen) and refresh themselves; ↻ (top right) does it by hand.
- The site is public: never add teacher names, pickup numbers, home/party addresses, phone
  numbers, medical, counseling or legal details. The sleep schedule (Matt asked for it) shows only
  "Dad's" / "Mom's" — never names or addresses.
- Calendar data is hand-synced from the "Kids" calendar in Calendar.app on Matt's Mac. EventKit
  is blocked for this app; JXA (`osascript -l JavaScript`) against Calendar.app works — read
  summary/startDate/endDate/recurrence/uid/excludedDates and expand recurrences yourself (first
  event per uid = master, the rest are moved occurrences). Kids' family details live in Matt's Second Brain vault
  (`Family/Kids/`) — pull only schedule-level facts from there.
- Weekly calendar sync: `node scripts/kids-calendar.mjs` reports Kids-calendar changes since the
  last `--accept`; copy them into `data/calendar.json` under the privacy rule above (drop street
  addresses — keep a place name like "Island Park · Field 3"; skip anything medical, counseling,
  legal, parents' own plans, and custody "Matt/Brigitte Day/Weekend" entries, which `sleep` already
  covers). Soccer games are always titled "Evie Soccer Game" / "Avery Soccer Game" (no opponent). ADM closures come from the district PDF into `school.json`, and
  `scripts/adm-to-kids-calendar.js` pushes them to the Kids calendar. Holidays are yearly rules in
  `calendar.json`, not dated entries.
- Run `node --test 'tests/*.test.mjs'` after touching `js/data.js`, `js/scene.js` or `js/store.js`.
- Coin balances are derived from the ledger in `store.js`; never store a balance. Each girl has a jar
  per house: every entry and request carries `house` ('dad' | 'mom', the sleep schedule's places);
  entries without one count as Dad's. Chores: `daily` once a day, `weekly` once a week (Mon–Sun, keyed
  on that Monday via `periodKey()`), `extra` once a day with that house's parent's OK — limits count
  across both houses and are enforced in `apply()` so every device agrees.
- State syncs through Supabase (project `ervin-data`, ref `gflocxcogragbwjplwgt`, schema
  `ervin_central`, table `ops`) — an append-only log `{ seq, op_id, bin, op }` that every device
  replays in `seq` order (`replay()` in store.js). All mutations are serializable ops through
  `apply()` — keep them idempotent and deterministic given the log order (mint ids up front; a
  retry with the same `op_id` is ignored by the unique index). The API allows only SELECT/INSERT
  for anon — never add UPDATE/DELETE grants; a correction is a new op.
- URL + **publishable** key live in `data/family.json → sync` (safe to be public). Never commit the
  secret key. Access control is deliberately open for now (Matt's call, Oct 2026).
- Passcodes (`data/family.json → passcodes`, SHA-256 of `ervin-central:<code>`): `dad` / `mom` open
  that parent's Parent management (their house's jars; `requireParent(house)` for approvals), and
  `siteTools` names whose code also gets sync/backup/wipe; `kids` is asked EVERY time a kid adds coins
  (then she picks the house) via `kidEarns()` in ui.js — both skipped while a parent is unlocked, whose
  house gets the coins. Untick needs no code. Never write the codes themselves into the repo.
- Schema changes: run SQL in the Supabase SQL Editor (or the Supabase MCP server with
  `project_ref=gflocxcogragbwjplwgt`). Setup + how-to-add-an-app notes live in Matt's Second Brain
  (`AI & Tools/Supabase — Personal App Backend.md`).
- Views export `title`, `render(params)` → HTML string, optional `mount(el, rerender)`. The
  router hands `mount` a fresh element each render, so binding listeners there is safe.

## LINQ menus
`api.linqconnect.com/api/FamilyMenu` is public with `Access-Control-Allow-Origin: *`, but its WAF
403s requests without a real browser User-Agent (browsers are fine; the Action sends one).
District identifier `MB8AWT`. Building ids are in `data/school.json`.
