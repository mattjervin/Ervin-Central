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
  where-they-sleep UI; the Tonight card takes tonight's parent color. Coins are gold.
- Entrance animations run only when arriving on a page (`.view.settled` disables them on tap re-renders). Respect `prefers-reduced-motion`.
- Content changes go in `data/*.json`, not code.
- When you change JS or CSS, bump the `?v=` on `app.js` and `app.css` in `index.html`. Home-screen
  shortcuts on the girls' iPhones cache hard; ↻ (top right) re-downloads everything by hand.
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
- Coin balances are derived from the ledger in `store.js`; never store a balance.
- State syncs to JSONBin (collection "Ervin Central": household / evelynn / avery bins). All
  mutations are serializable ops through `apply()` — keep them idempotent (mint ids up front)
  because the outbox replays them onto the latest bin before each PUT.
- Never commit JSONBin keys or a setup link. The master key is only for scripts/setup-jsonbin.mjs.
- Views export `title`, `render(params)` → HTML string, optional `mount(el, rerender)`. The
  router hands `mount` a fresh element each render, so binding listeners there is safe.

## LINQ menus
`api.linqconnect.com/api/FamilyMenu` is public with `Access-Control-Allow-Origin: *`, but its WAF
403s requests without a real browser User-Agent (browsers are fine; the Action sends one).
District identifier `MB8AWT`. Building ids are in `data/school.json`.
