# Ervin Central — notes for Claude

Family digital-signage site for Matt's two daughters (Evelynn, Meadow View Elementary; Avery,
Adel Elementary — ADM Community Schools, Adel IA). Static site on GitHub Pages; future target is
a wall-mounted touch screen. Visual language is ported from ErvOS (SwiftUI app at
`~/Library/CloudStorage/OneDrive-LifeCareServices/Work Brain/App Dev/ErvOS`, `Theme.swift`).

## Rules
- No build step, no framework, no npm dependencies. ES modules loaded directly by the browser.
- Every interpolated value in a view goes through `esc()`.
- Touch first: tap targets ≥ 44px (primary actions 56px+). No hover-only affordances.
- Content changes go in `data/*.json`, not code.
- The site is public: never add teacher names, pickup numbers, addresses, phone numbers,
  medical or custody details. Kids' family details live in Matt's Second Brain vault
  (`Family/Kids/`) — pull only schedule-level facts from there.
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
