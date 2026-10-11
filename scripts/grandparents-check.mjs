// What Grandparents Central will show, and what it's missing — run after every calendar sync.
//   node scripts/grandparents-check.mjs [--days 120]
//
// Lists the next N days of grandparent items (games, flagged shows/tournaments, the girls' birthdays
// and parties) with the venue each one maps to, and flags:
//   · NO VENUE   — an event with a place in its detail that matches nothing in calendar.json → places,
//                  so it gets no address, no Map button and no address in "Add to my calendar".
//                  Add the venue (public places only — never a home).
//   · CHECK      — events that look like shows/tournaments but aren't flagged. Add "grandparents": true,
//                  or "grandparents": false to say "not for the grandparents" and silence it.
//   · note       — a venue with only a city (Map searches by name); add its street address if you find one.
// Exits 1 on NO VENUE or CHECK, so a sync can't miss them.

import { readFile } from 'node:fs/promises';
import { cfg, grandparentItems, itemsOn, placeFor, isAway } from '../js/data.js';
import { placeLine } from '../js/views/grandparents.js';
import { addDays, ymd } from '../js/util.js';

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 120;
const json = async (f) => JSON.parse(await readFile(new URL(`../private/data/${f}`, import.meta.url), 'utf8'));
Object.assign(cfg, {
  family: await json('family.json'), school: await json('school.json'), calendar: await json('calendar.json'),
  chores: await json('chores.json'), menus: { schools: {} }, wear: { rules: [] }, scope: 'family',
});

const now = new Date();
const items = grandparentItems(now, DAYS);
const flags = [];
const notes = [];
const seen = new Set();
// Titles explicitly marked "grandparents": false — someone already decided they're not for the grandparents.
const declined = new Set([...(cfg.calendar.events || []), ...(cfg.calendar.recurring || [])].filter((e) => e.grandparents === false).map((e) => e.title));

console.log(`Grandparents Central — next ${DAYS} days (${items.length} items):`);
for (const x of items) {
  const p = placeFor(x);
  const venue = p ? `${p.name}${isAway(p) ? ' (away → Map on family pages)' : ''}` : '—';
  console.log(`  ${ymd(x.date)}  ${x.icon} ${x.title} · ${placeLine(x) || 'no place'}   [venue: ${venue}]`);
  const key = `${x.title}|${x.detail}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!p && x.detail && x.kind !== 'birthday') flags.push(`NO VENUE    ${x.title} — "${x.detail}" matches no calendar.json → places entry`);
  if (p && !p.address) notes.push(`note        ${p.name} — no street address, only "${p.city || '?'}"; Map searches by name`);
}

// Shows, recitals, tournaments, the girls' own parties that aren't on the page yet.
const LOOKS = /concert|musical|recital|play\b|show\b|tournament|showcase|performance|graduation|ceremony/i;
for (let i = 0; i < DAYS; i++) {
  for (const x of itemsOn(addDays(now, i))) {
    const key = `check|${x.title}`;
    if (x.grandparents || declined.has(x.title) || !LOOKS.test(x.title) || seen.has(key)) continue;
    seen.add(key);
    flags.push(`CHECK       ${x.title} (${ymd(addDays(now, i))}) — a show/tournament? add "grandparents": true if the grandparents would come`);
  }
}

if (notes.length) console.log(`\n${[...new Set(notes)].map((f) => `  ${f}`).join('\n')}`);
if (flags.length) {
  console.log(`\n${flags.length} thing${flags.length === 1 ? '' : 's'} to look at:\n${[...new Set(flags)].map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nEvery grandparent item maps to a venue. ✓');
