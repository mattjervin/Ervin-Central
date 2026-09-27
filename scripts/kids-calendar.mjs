// Reads the "Kids" calendar from Calendar.app (JXA — EventKit is blocked for this app), expands
// repeating events into dated occurrences, and reports what changed since the last accepted sync.
// It never edits data/calendar.json itself: the weekly "Ervin Central calendar sync" task (or a
// person) reads the report, applies the privacy rules in CLAUDE.md, updates calendar.json, then runs
// --accept so next week's report only shows new changes.
//
//   node scripts/kids-calendar.mjs            changes since the last accepted snapshot
//   node scripts/kids-calendar.mjs --all      every occurrence in the window, not just changes
//   node scripts/kids-calendar.mjs --accept   mark the current calendar as synced
//   --days N                                  look N days ahead (default 150)
//
// Files live in .cache/ (gitignored) because they hold everything on the calendar, private items
// and addresses included. Only what the sync deliberately copies into calendar.json is published.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const CACHE = new URL('.cache/', root);
const CURRENT = new URL('kids-calendar.current.json', CACHE);
const SNAPSHOT = new URL('kids-calendar.snapshot.json', CACHE);
const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 150;

if (args.includes('--accept')) {
  await rename(CURRENT, SNAPSHOT);
  console.log('Accepted: the current Kids calendar is now the synced snapshot.');
  process.exit(0);
}

// ---- Read Calendar.app ----------------------------------------------------------------------

const JXA = `
const c = Application('Calendar').calendars.whose({ name: 'Kids' })[0];
const e = c.events;
const cols = { uid: e.uid(), title: e.summary(), start: e.startDate(), end: e.endDate(), allDay: e.alldayEvent(),
  rrule: e.recurrence(), location: e.location() };
let excluded = [];
try { excluded = e.excludedDates(); } catch (err) {}
JSON.stringify(cols.uid.map((u, i) => ({ uid: u, title: cols.title[i], start: cols.start[i], end: cols.end[i],
  allDay: cols.allDay[i], rrule: cols.rrule[i] || '', location: cols.location[i] || '', excluded: excluded[i] || [] })));
`;
const raw = JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', JXA], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 10 * 60e3 }));

// ---- Expand ---------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAY = 864e5;
const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const today = new Date(); today.setHours(0, 0, 0, 0);
const horizon = new Date(+today + DAYS * DAY);

function parseRule(rrule) {
  const r = Object.fromEntries(rrule.split(';').filter(Boolean).map((p) => p.split('=')));
  const until = r.UNTIL ? new Date(r.UNTIL.replace(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)Z?)?$/, (_, y, m, d, H = '23', M = '59', S = '59') => `${y}-${m}-${d}T${H}:${M}:${S}${r.UNTIL.endsWith('Z') ? 'Z' : ''}`)) : null;
  return { freq: r.FREQ, interval: Number(r.INTERVAL || 1), byday: r.BYDAY ? r.BYDAY.split(',').map((x) => BYDAY[x.slice(-2)]) : null, until, count: r.COUNT ? Number(r.COUNT) : null };
}

/** Start times of every occurrence of a repeating master, up to the horizon. */
function occurrences(master) {
  const rule = parseRule(master.rrule);
  const first = new Date(master.start);
  const out = [];
  const push = (d) => { if ((!rule.until || d <= rule.until) && (!rule.count || out.length < rule.count)) out.push(d); };
  const withTime = (day) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), first.getHours(), first.getMinutes());
  if (rule.freq === 'WEEKLY') {
    const days = rule.byday || [first.getDay()];
    const week0 = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay());
    for (let w = 0; ; w += rule.interval) {
      const ws = new Date(week0.getFullYear(), week0.getMonth(), week0.getDate() + 7 * w);
      if (ws > horizon || (rule.until && ws > rule.until) || (rule.count && out.length >= rule.count)) break;
      for (const dow of [...days].sort()) {
        const d = withTime(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + dow));
        if (d >= first) push(d);
      }
    }
  } else if (rule.freq === 'DAILY') {
    for (let d = first; d <= horizon && (!rule.until || d <= rule.until) && (!rule.count || out.length < rule.count); d = withTime(new Date(+d + rule.interval * DAY + 36e5))) push(d);
  } else if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
    for (let i = 0; ; i += rule.interval) {
      const d = rule.freq === 'MONTHLY' ? new Date(first.getFullYear(), first.getMonth() + i, first.getDate(), first.getHours(), first.getMinutes())
        : new Date(first.getFullYear() + i, first.getMonth(), first.getDate(), first.getHours(), first.getMinutes());
      if (d > horizon || (rule.until && d > rule.until) || (rule.count && out.length >= rule.count)) break;
      push(d);
    }
  } else push(first);
  return out;
}

const byUid = new Map();
for (const e of raw) (byUid.get(e.uid) || byUid.set(e.uid, []).get(e.uid)).push(e);

const occ = [];
const add = (e, start, series) => {
  const s = new Date(start);
  const len = new Date(e.end) - new Date(e.start);
  const end = new Date(+s + len);
  if (end < today || s > horizon) return;
  // All-day ends at 23:59:59 of the last day (or midnight after it) — report the inclusive last day.
  const lastDay = e.allDay ? ymd(new Date(+end - 1000)) : ymd(end);
  occ.push({
    uid: e.uid, title: e.title.trim(), date: ymd(s), allDay: e.allDay,
    start: e.allDay ? null : hm(s), end: e.allDay ? null : hm(end), lastDay: lastDay !== ymd(s) ? lastDay : null,
    repeats: series ? e.rrule : null, location: e.location.split('\n')[0].trim(),
  });
};

for (const [, list] of byUid) {
  const [master, ...moved] = list; // first event per uid is the master; the rest are moved occurrences
  if (!master.rrule) { list.forEach((e) => add(e, e.start, false)); continue; }
  const skip = new Set((master.excluded || []).map((x) => ymd(new Date(x))));
  let starts = occurrences(master).filter((d) => !skip.has(ymd(d)));
  // A moved occurrence replaces the generated one it came from (the nearest within half a week).
  for (const m of moved) {
    const t = +new Date(m.start);
    let best = -1;
    starts.forEach((d, i) => { if (Math.abs(d - t) < 3.5 * DAY && (best < 0 || Math.abs(d - t) < Math.abs(starts[best] - t))) best = i; });
    if (best >= 0) starts.splice(best, 1);
  }
  starts.forEach((d) => add(master, d, true));
  moved.forEach((m) => add(m, m.start, true));
}

// ADM closures that scripts/adm-to-kids-calendar.js adds live in data/school.json already.
const isAdm = (o) => /^(No School - |Early Dismissal - |Last Day of School - )/.test(o.title);
const list = occ.filter((o) => !isAdm(o)).sort((a, b) => (a.date + (a.start || '') + a.title < b.date + (b.start || '') + b.title ? -1 : 1));

// ---- Report ---------------------------------------------------------------------------------

await mkdir(CACHE, { recursive: true });
await writeFile(CURRENT, JSON.stringify({ at: new Date().toISOString(), days: DAYS, occurrences: list }, null, 1) + '\n');

const line = (o) => `${o.date}${o.lastDay ? '→' + o.lastDay : ''} ${o.start ? `${o.start}–${o.end}` : 'all day'}  ${o.title}${o.location ? `  @ ${o.location}` : ''}${o.repeats ? `  [repeats ${o.repeats}]` : ''}`;
const key = (o) => `${o.uid}|${o.date}|${o.start}|${o.end}|${o.lastDay}|${o.title}|${o.location}`;

if (args.includes('--all')) {
  console.log(`Kids calendar, next ${DAYS} days (${list.length} occurrences):\n${list.map(line).join('\n')}`);
  process.exit(0);
}

let before = null;
try { before = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch { /* first run */ }
if (!before) {
  console.log(`No snapshot yet — here is everything (${list.length}). Sync it, then run --accept.\n${list.map(line).join('\n')}`);
  process.exit(0);
}
// Only compare dates both snapshots cover, so days rolling into the window don't count as "new"
// unless they're one-offs (recurring series already in calendar.json roll forward on their own).
const oldKeys = new Set(before.occurrences.map(key));
const newKeys = new Set(list.map(key));
const since = ymd(today);
const oldHorizon = ymd(new Date(new Date(before.at).setHours(0, 0, 0, 0) + before.days * DAY));
const added = list.filter((o) => !oldKeys.has(key(o)) && (o.date <= oldHorizon || !o.repeats));
const removed = before.occurrences.filter((o) => !newKeys.has(key(o)) && (o.lastDay || o.date) >= since);
if (!added.length && !removed.length) {
  console.log('No changes in the Kids calendar since the last sync.');
} else {
  console.log(`Kids calendar changes since ${before.at.slice(0, 10)}:`);
  if (added.length) console.log(`\nNEW or CHANGED (${added.length}):\n${added.map(line).join('\n')}`);
  if (removed.length) console.log(`\nGONE or MOVED (${removed.length}):\n${removed.map(line).join('\n')}`);
  console.log('\nUpdate data/calendar.json (privacy rules in CLAUDE.md), then: node scripts/kids-calendar.mjs --accept');
}
