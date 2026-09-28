// Loads the hand-edited config in data/*.json and derives what the views ask for: a day's
// schedule, a kid's chores for a date, the lunch menu, the weather.

import { addDays, at, clock, parseYmd, ymd } from './util.js';

const clockShort = (hhmm) => clock(hhmm, false);
import { fetchMenu } from './linq.js';

export const cfg = { family: null, school: null, calendar: null, chores: null, menus: null, wear: null };

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function loadConfig() {
  const [family, school, calendar, chores, menus, wear] = await Promise.all([
    getJson('data/family.json'),
    getJson('data/school.json'),
    getJson('data/calendar.json'),
    getJson('data/chores.json'),
    getJson('data/menus.json').catch(() => ({ updated: null, schools: {} })),
    getJson('data/wear.json').catch(() => ({ rules: [] })),
  ]);
  Object.assign(cfg, { family, school, calendar, chores, menus, wear });
}

export const kids = () => cfg.family.kids;
export const kid = (id) => cfg.family.kids.find((k) => k.id === id);
export const schoolOf = (k) => cfg.school.schools[k.school];

// ---- School days -------------------------------------------------------------------------

/** Find `key` in a list of "YYYY-MM-DD" strings or { date, label } objects. */
const dayEntry = (list, key) => {
  const hit = (list || []).find((n) => (typeof n === 'string' ? n : n.date) === key);
  return hit && (typeof hit === 'string' ? { date: hit } : hit);
};

/** { type: 'full' | 'early' | 'none', reason, note } for one school on one day.
 *  `note` is set only for days the district calendar calls out (breaks, workdays, conferences). */
export function schoolDay(schoolKey, date) {
  const y = cfg.school.year;
  const s = cfg.school.schools[schoolKey];
  const key = ymd(date);
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return { type: 'none', reason: 'Weekend' };
  if (key < y.firstDay || key > y.lastDay) return { type: 'none', reason: 'Summer break' };
  const off = dayEntry(y.noSchool, key);
  if (off) return { type: 'none', reason: off.label || 'No school', note: off.label || 'No school' };
  const early = dayEntry(y.firstDaysEarlyOut, key) || dayEntry(y.extraEarlyOut, key);
  if (early) return { type: 'early', reason: 'Early out', note: early.label || '' };
  if (s.earlyWeekdays.includes(dow)) return { type: 'early', reason: 'Early out' };
  return { type: 'full' };
}

/** Weekday before `date` (Fri for a Mon), to tell the first day of a break from the rest. */
const prevWeekday = (date) => addDays(date, date.getDay() === 1 ? -3 : -1);

// ---- Schedule ----------------------------------------------------------------------------

/** Every item on one day: school blocks, recurring items, one-off events. Sorted, all-day first.
 *  item = { title, icon, who: [kidIds], allDay, start: Date, end: Date, kind } */
export function itemsOn(date) {
  const key = ymd(date);
  const dow = date.getDay();
  const out = [];

  // School, merged when both girls share the same hours so the agenda doesn't say it twice.
  const blocks = new Map();
  const offs = new Map(); // district no-school days (breaks, workdays), one row per reason
  let note = '';
  for (const k of kids()) {
    const day = schoolDay(k.school, date);
    if (day.type === 'none') {
      if (!day.note) continue;
      const o = offs.get(day.note) || { who: [], first: schoolDay(k.school, prevWeekday(date)).note !== day.note };
      o.who.push(k.id);
      offs.set(day.note, o);
      continue;
    }
    if (day.note) note = day.note;
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
      title: `School${early ? ' · early out' : ''}${note ? ` · ${note}` : ''}`,
      detail: bl.map((x) => `${x.names.join(' & ')} ${clockShort(x.a)}–${clockShort(x.b)}`).join(' · '),
      icon: '🏫', who: bl.flatMap((x) => x.who), kind: 'school',
      start: at(date, bl.map((x) => x.a).sort()[0]), end: at(date, bl.map((x) => x.b).sort().pop()), allDay: false,
    });
  }
  for (const [reason, o] of offs) {
    // `firstOfRun` lets Coming Up show a week-long break once instead of five times.
    out.push({ ...toItem({ title: `No school · ${reason}`, icon: '🎒', who: o.who }, date), kind: 'noschool', firstOfRun: o.first });
  }

  for (const r of cfg.calendar.recurring || []) {
    if (!r.days.includes(dow)) continue;
    if (r.from && key < r.from) continue;
    if (r.until && key > r.until) continue;
    if (r.except?.includes(key)) continue;
    // schoolDays: only when (one of) its kids actually has school that day — PE day, not on a break.
    if (r.schoolDays && !kids().some((k) => (!r.who?.length || r.who.includes(k.id)) && schoolDay(k.school, date).type !== 'none')) continue;
    out.push(toItem(r, date));
  }
  for (const e of cfg.calendar.events || []) {
    if (e.date === key || (e.endDate && key >= e.date && key <= e.endDate)) out.push(toItem(e, date));
  }
  for (const h of holidaysIn(date.getFullYear())) {
    if (h.date === key) out.push({ ...toItem({ title: h.title, icon: h.icon, who: [] }, date), kind: 'holiday' });
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

// ---- Holidays -----------------------------------------------------------------------------------
// calendar.json lists each holiday once with a yearly rule, so the site never runs out of them.

const DOWS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Easter Sunday (Anonymous Gregorian algorithm). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(y, month - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

/** "3rd-mon-01", "last-mon-05", "01-01", "easter", "election" → Date in year `y` (null if unknown). */
export function ruleDate(rule, y) {
  if (rule === 'easter') return easter(y);
  if (rule === 'election') { // the Tuesday after the first Monday in November
    const d = new Date(y, 10, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return addDays(d, 1);
  }
  let m = /^(\d\d)-(\d\d)$/.exec(rule);
  if (m) return new Date(y, Number(m[1]) - 1, Number(m[2]));
  m = /^(1st|2nd|3rd|4th|5th|last)-(sun|mon|tue|wed|thu|fri|sat)-(\d\d)$/.exec(rule);
  if (!m) return null;
  const month = Number(m[3]) - 1;
  const dow = DOWS.indexOf(m[2]);
  if (m[1] === 'last') {
    const d = new Date(y, month + 1, 0);
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
    return d;
  }
  const d = new Date(y, month, 1);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return addDays(d, 7 * (parseInt(m[1], 10) - 1));
}

const holidayCache = new Map();

/** Every holiday that falls in year `y`: [{ title, icon, date: 'YYYY-MM-DD', countdown, dayOff }]. */
export function holidaysIn(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const out = [];
  for (const h of cfg.calendar.holidays || []) {
    const dates = h.rule ? [ruleDate(h.rule, y)].filter(Boolean).map((d) => ymd(d))
      : [...(h.dates || []), ...(h.date ? [h.date] : [])].filter((d) => d.startsWith(`${y}-`));
    for (const date of dates) out.push({ title: h.title, icon: h.icon || '📅', date, countdown: Boolean(h.countdown), dayOff: Boolean(h.dayOff) });
  }
  holidayCache.set(y, out);
  return out;
}

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
  const hol = [...holidaysIn(today.getFullYear()), ...holidaysIn(today.getFullYear() + 1)].filter((h) => h.countdown).map((h) => {
    const d = parseYmd(h.date);
    return { title: h.title, icon: h.icon, date: d, days: days(d), kind: 'holiday' };
  }).filter((h, i, all) => h.days >= 0 && all.findIndex((x) => x.title === h.title && x.days >= 0) === i); // next one only
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
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max` +
    `&wind_speed_unit=mph` +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(timezone)}&forecast_days=7`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10e3) });
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const j = await res.json();
  const data = {
    now: { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, ...wx(j.current.weather_code) },
    days: j.daily.time.map((t, i) => ({
      date: t, hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]),
      rain: j.daily.precipitation_probability_max[i], code: j.daily.weather_code[i], ...wx(j.daily.weather_code[i]),
      feelsHi: Math.round(j.daily.apparent_temperature_max[i]), feelsLo: Math.round(j.daily.apparent_temperature_min[i]),
      wind: Math.round(j.daily.wind_speed_10m_max[i]),
    })),
  };
  wxCache = { at: Date.now(), data };
  return data;
}

// ---- What to wear -------------------------------------------------------------------------

const SNOW = [71, 73, 75, 77, 85, 86];

/** Outfit for one forecast day, from the rules in data/wear.json: [{ group, icon, text }]. */
export function whatToWear(day) {
  const hi = day.feelsHi ?? day.hi, lo = day.feelsLo ?? day.lo;
  const f = { hi, lo, swing: hi - lo, rain: day.rain ?? 0, snow: SNOW.includes(day.code), wind: day.wind ?? 0,
    cloudy: day.code >= 3 }; // overcast, fog, rain or snow — no sun to warm them up
  const ok = (w) => (w.hiMin == null || f.hi >= w.hiMin) && (w.hiMax == null || f.hi <= w.hiMax)
    && (w.loMin == null || f.lo >= w.loMin) && (w.loMax == null || f.lo <= w.loMax)
    && (w.swingMin == null || f.swing >= w.swingMin) && (w.rainMin == null || f.rain >= w.rainMin)
    && (w.windMin == null || f.wind >= w.windMin) && (w.snow == null || f.snow === w.snow)
    && (w.cloudy == null || f.cloudy === w.cloudy);
  const out = new Map();
  for (const r of cfg.wear?.rules || []) if (!out.has(r.group) && ok(r.when || {})) out.set(r.group, r);
  return [...out.values()];
}

/** Last weather we fetched, without waiting (the Home scene repaints every minute from this). */
export const lastWeather = () => wxCache?.data || null;
