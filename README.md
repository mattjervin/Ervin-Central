# Ervin Central

The Ervin family's digital signage — a calendar, school info (lunch menus for both girls), a
chore chart, and **Kindness Coins** for doing chores and extra household tasks.

Built as a plain static website so it runs on the kids' iPads and iPhones today and on a
wall-mounted touch screen later. Its look and component vocabulary come from
[ErvOS](https://github.com/mattjervin/ErvOS): the same dark palette, heavy system type,
colored section markers, stat tiles and the serif wordmark.

## Pages

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Home** | Greeting, clock, weather, one-line summary of the day, today's schedule, lunch, chore progress, coin balances | Everything below |
| **Calendar** | Week view, filterable by kid, with school hours, early-outs, specials and weather | `data/calendar.json` + `data/school.json` |
| **School** | Hours, specials, and the week's lunch/breakfast menu per girl | `data/school.json` + ADM's LINQ Connect menus |
| **Chores** | Big tap tiles by morning / after school / evening; bonus tasks | `data/chores.json` |
| **Coins** | Balances, 7-day earnings, reward shop, parent approvals, history | The on-device ledger |

## Editing the family data

All content is hand-edited JSON in `data/` — no code changes needed:

- **`family.json`** — kids (name, emoji, color, school), location for weather, kiosk settings.
- **`calendar.json`** — `recurring` weekly items and one-off `events`. `who` is a list of kid ids; empty means the whole family.
- **`school.json`** — school hours, early-out weekdays, specials, and the school-year dates. **TODO:** fill `lastDay`, `noSchool` and `extraEarlyOut` from the ADM academic calendar.
- **`chores.json`** — daily chores (with `who`, `days`, `part`), bonus tasks, rewards and their coin values.
- **`menus.json`** — generated; don't edit. A GitHub Action refreshes it every morning.

## How Kindness Coins work

- Ticking a daily chore gives its coins **immediately**; unticking takes them back.
- **Bonus tasks** ("Unload the dishwasher") and **rewards** ("Pick what's for dinner") go into a
  *Waiting for a parent* queue on the Coins page.
- Approving, adjusting, removing ledger rows and backups need the **parent PIN** (🔒 top right).
  The first unlock on a device asks you to create one. Parent mode relocks after 5 minutes.
- Balances are always the sum of the ledger, so every coin can be traced to a chore or approval.

### Shared state (next step)

Right now chore check-offs and coins are saved **per device** (`localStorage`). An iPad and an
iPhone won't see each other's coins yet. `js/store.js` isolates persistence behind a two-method
`backend` (load/save) so a shared backend (Supabase, Firebase, or a tiny Cloudflare Worker) can
drop in without touching the views. Until then, use one device as "the" chore chart, and back
up from the Coins page.

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
css/app.css           ErvOS palette, components, iPad/iPhone breakpoints
js/app.js             Router, clock, kiosk behaviors
js/data.js            Config loading, schedule engine, chores, menus, weather
js/store.js           Chore check-offs, coin ledger, approvals (localStorage)
js/linq.js            LINQ Connect menu client (shared by browser + Action)
js/ui.js              Card/header/stat/chip components, modal, toast, PIN pad
js/views/*.js         One module per page: render() → HTML, mount() → events
data/*.json           Family-editable content
scripts/fetch-menus.mjs + .github/workflows/menus.yml   Nightly menu cache
```
