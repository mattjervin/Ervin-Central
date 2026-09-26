// Loads the hand-edited config in data/*.json and derives what the views ask for: a day's
// schedule, a kid's chores for a date, the lunch menu, the weather.

import { addDays, at, clock, parseYmd, ymd } from './util.js';

const clockShort = (hhmm) => clock(hhmm, false);
import { fetchMenu } from './linq.js';

export const cfg = { family: null, school: null, calendar: null, chores: null, menus: null };

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function loadConfig() {
  const [family, school, calendar, chores, menus] = await Promise.all([
    getJson('data/family.json'),
    getJson('data/school.json'),
    getJson('data/calendar.json'),
    getJson('data/chores.json'),
    getJson('data/menus.json').catch(() => ({ updated: null, schools: {} })),
  ]);
  Object.assign(cfg, { family, school, calendar, chores, menus });
}

export const kids = () => cfg.family.kids;
export const kid = (id) => cfg.family.kids.find((k) => k.id === id);
export const schoolOf = (k) => cfg.school.schools[k.school];

// ---- School days -------------------------------------------------------------------------

/** { type: 'full' | 'early' | 'none', reason } for one school on one day. */
export function schoolDay(schoolKey, date) {
  const y = cfg.school.year;
  const s = cfg.school.schools[schoolKey];
  const key = ymd(date);
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return { type: 'none', reason: 'Weekend' };
  if (key < y.firstDay || key > y.lastDay) return { type: 'none', reason: 'Summer break' };
  const off = y.noSchool.find((n) => (typeof n === 'string' ? n : n.date) === key);
  if (off) return { type: 'none', reason: typeof off === 'string' ? 'No school' : off.label || 'No school' };
  if (y.firstDaysEarlyOut.includes(key) || y.extraEarlyOut.includes(key) || s.earlyWeekdays.includes(dow)) {
    return { type: 'early', reason: 'Early out' };
  }
  return { type: 'full' };
}

// ---- Schedule ----------------------------------------------------------------------------

/** Every item on one day: school blocks, recurring items, one-off events. Sorted, all-day first.
 *  item = { title, icon, who: [kidIds], allDay, start: Date, end: Date, kind } */
export function itemsOn(date) {
  const key = ymd(date);
  const dow = date.getDay();
  const out = [];

  // School, merged when both girls share the same hours so the agenda doesn't say it twice.
  const blocks = new Map();
  for (const k of kids()) {
    const day = schoolDay(k.school, date);
    if (day.type === 'none') continue;
    const s = schoolOf(k);
    const [a, b] = day.type === 'early' ? s.early : s.full;
    const sig = `${a}-${b}`;
    const block = blocks.get(sig) || { a, b, who: [], early: day.type === 'early', names: [] };
    block.who.push(k.id);
    block.names.push(s.short);
    blocks.set(sig, block);
  }
  // One "School" row per day, spanning both girls' hours, so agendas don't list it twice.
  const bl = [...blocks.values()];
  if (bl.length) {
    const early = bl.some((x) => x.early);
    out.push({
      title: early ? 'School · early out' : 'School',
      detail: bl.map((x) => `${x.names.join(' & ')} ${clockShort(x.a)}–${clockShort(x.b)}`).join(' · '),
      icon: '🏫', who: bl.flatMap((x) => x.who), kind: 'school',
      start: at(date, bl.map((x) => x.a).sort()[0]), end: at(date, bl.map((x) => x.b).sort().pop()), allDay: false,
    });
  }

  for (const r of cfg.calendar.recurring || []) {
    if (!r.days.includes(dow)) continue;
    if (r.from && key < r.from) continue;
    if (r.until && key > r.until) continue;
    if (r.except?.includes(key)) continue;
    out.push(toItem(r, date));
  }
  for (const e of cfg.calendar.events || []) {
    if (e.date === key || (e.endDate && key >= e.date && key <= e.endDate)) out.push(toItem(e, date));
  }
  for (const h of cfg.calendar.holidays || []) {
    if (h.date === key) out.push({ ...toItem({ ...h, who: [] }, date), kind: 'holiday' });
  }
  for (const b of cfg.family.birthdays || []) {
    if (key.slice(5) === b.date) {
      const age = b.year ? date.getFullYear() - b.year : null;
      const title = `${b.name}'s ${age ? ordinal(age) + ' ' : ''}birthday`;
      out.push({ ...toItem({ title, icon: b.icon || '🎂', who: b.kid ? [b.kid] : [] }, date), kind: 'birthday' });
    }
  }

  // The same thing at the same time for both girls reads once, with both dots.
  const merged = [];
  for (const it of out) {
    const twin = merged.find((m) => m.kind !== 'school' && m.kind === it.kind && m.title === it.title && +m.start === +it.start && m.who.length && it.who.length);
    if (twin) twin.who = [...new Set([...twin.who, ...it.who])];
    else merged.push({ ...it, who: [...it.who] });
  }
  return merged.sort((x, y) => (x.allDay === y.allDay ? x.start - y.start : x.allDay ? -1 : 1));
}

function toItem(src, date) {
  const allDay = !src.start;
  return {
    title: src.tentative ? `${src.title} ?` : src.title, detail: src.detail || '', icon: src.icon || '📌', who: src.who || [],
    kind: src.kind || (src.days ? 'recurring' : 'event'), tentative: Boolean(src.tentative),
    allDay,
    start: allDay ? at(date, '00:00') : at(date, src.start),
    end: allDay ? at(date, '23:59') : at(date, src.end || src.start),
  };
}

export const forKid = (items, kidId) => (kidId ? items.filter((i) => !i.who.length || i.who.includes(kidId)) : items);

/** Items still ahead of now, across the next `days` days. */
export function upcoming(days = 7, now = new Date()) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(now, i);
    for (const it of itemsOn(d)) if (it.end > now) out.push({ ...it, date: d });
  }
  return out;
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---- Countdowns -----------------------------------------------------------------------------------

/** Six "days until" tiles, soonest first. The girls' birthdays are always included; the other four
 *  are the soonest of everyone else's birthdays and the major holidays (holidays with countdown: true). */
export function countdowns(now = new Date(), total = 6) {
  const today = parseYmd(ymd(now));
  const days = (d) => Math.round((d - today) / 864e5);
  const bday = (b) => {
    const [m, dd] = b.date.split('-').map(Number);
    let d = new Date(today.getFullYear(), m - 1, dd);
    if (d < today) d = new Date(today.getFullYear() + 1, m - 1, dd);
    return {
      title: b.kid ? b.name : `${b.name}'s birthday`, icon: b.icon || '🎂', date: d, days: days(d),
      turns: b.year ? d.getFullYear() - b.year : null, kid: b.kid || null, kind: 'birthday',
    };
  };
  const bs = (cfg.family.birthdays || []).map(bday);
  const pinned = bs.filter((b) => b.kid).sort((a, b) => a.days - b.days);
  const hol = (cfg.calendar.holidays || []).filter((h) => h.countdown).map((h) => {
    const d = parseYmd(h.date);
    return { title: h.title, icon: h.icon, date: d, days: days(d), kind: 'holiday' };
  }).filter((h) => h.days >= 0);
  const rest = [...bs.filter((b) => !b.kid), ...hol].sort((a, b) => a.days - b.days).slice(0, total - pinned.length);
  return [...pinned, ...rest].sort((a, b) => a.days - b.days); // soonest first, wherever the girls land
}

// ---- Where the girls sleep ------------------------------------------------------------------------

/** { key, label, icon, color, why } for the night of `date`. Overrides beat the weekly pattern. */
export function sleepOn(date) {
  const sl = cfg.calendar.sleep;
  if (!sl) return null;
  const key = ymd(date);
  const place = (k, why) => (k && sl.places[k] ? { key: k, ...sl.places[k], why } : null);
  const o = (sl.overrides || []).find((x) => key >= x.from && key <= (x.to || x.from));
  if (o) return place(o.who, o.note || 'Schedule change');
  const dow = date.getDay();
  if (sl.weekdays[dow]) return place(sl.weekdays[dow], 'Weeknight');
  if (sl.weekendDays.includes(dow)) {
    // Which Friday does this weekend hang off? Sat → yesterday, Sun → two days back.
    const fri = addDays(date, -((dow + 2) % 7));
    const weeks = Math.round((fri - parseYmd(sl.weekendAnchor.friday)) / (7 * 864e5));
    const who = weeks % 2 === 0 ? sl.weekendAnchor.who : sl.weekendAnchor.alternate;
    return place(who, 'Weekend');
  }
  return null;
}

/** Next night the girls sleep somewhere different from `date`. */
export function nextSwitch(date) {
  const now = sleepOn(date);
  for (let i = 1; i < 21; i++) {
    const d = addDays(date, i);
    const s = sleepOn(d);
    if (s && now && s.key !== now.key) return { date: d, ...s };
  }
  return null;
}

// ---- Chores ------------------------------------------------------------------------------

export function choresFor(kidId, date = new Date()) {
  const dow = date.getDay();
  return cfg.chores.chores.filter((c) => (!c.who || c.who.includes(kidId)) && (!c.days || c.days.includes(dow)));
}

// ---- Menus -------------------------------------------------------------------------------

const live = {}; // schoolKey → { iso → day } merged from live calls this session

/** Menu for one school over [start, start+n). Cached file first; live LINQ fills any gap. */
export async function menuRange(schoolKey, start, n = 5) {
  const want = Array.from({ length: n }, (_, i) => ymd(addDays(start, i)));
  const have = { ...(cfg.menus.schools?.[schoolKey] || {}), ...(live[schoolKey] || {}) };
  if (want.some((d) => !have[d] && parseYmd(d).getDay() % 6 !== 0)) {
    try {
      const got = await fetchMenu({
        districtId: cfg.school.district.linq.districtId,
        buildingId: cfg.school.schools[schoolKey].buildingId,
        start: want[0], end: want[want.length - 1],
      });
      live[schoolKey] = { ...(live[schoolKey] || {}), ...got };
      Object.assign(have, got);
    } catch (err) {
      console.warn('Live menu unavailable, using cache', err);
    }
  }
  return want.map((d) => ({ date: d, menu: have[d] || null }));
}

/** One-line lunch summary: the hot entrée, else the first main. */
export function lunchHeadline(menu) {
  const lunch = menu?.lunch || [];
  const hot = lunch.find((m) => /hot/i.test(m.label)) || lunch[0];
  return hot?.main?.[0] || null;
}

// ---- Weather (Open-Meteo, no key) ----------------------------------------------------------

const WX = [
  [[0], '☀️', 'Clear'], [[1], '🌤️', 'Mostly sunny'], [[2], '⛅', 'Partly cloudy'], [[3], '☁️', 'Cloudy'],
  [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'], [[95, 96, 99], '⛈️', 'Storms'],
];
const wx = (code) => { const hit = WX.find(([codes]) => codes.includes(code)); return { icon: hit?.[1] || '🌡️', label: hit?.[2] || '' }; };

let wxCache = null;
export async function weather() {
  if (wxCache && Date.now() - wxCache.at < 20 * 60e3) return wxCache.data;
  const { lat, lon, timezone } = cfg.family.location;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(timezone)}&forecast_days=7`;
  const j = await (await fetch(url)).json();
  const data = {
    now: { temp: Math.round(j.current.temperature_2m), ...wx(j.current.weather_code) },
    days: j.daily.time.map((t, i) => ({
      date: t, hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]),
      rain: j.daily.precipitation_probability_max[i], ...wx(j.daily.weather_code[i]),
    })),
  };
  wxCache = { at: Date.now(), data };
  return data;
}
