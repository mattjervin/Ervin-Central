// Small shared helpers: HTML escaping, dates, and the kid lookup.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape anything interpolated into a template literal. Every view goes through this. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Dates ------------------------------------------------------------------------------
// Everything date-keyed uses local ISO days ("2026-09-26"), never UTC — a chore ticked at
// 8pm in Iowa belongs to today, not tomorrow.

export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d) {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
}

/** The Monday a chore week starts on (chore weeks run Monday–Sunday). */
export function mondayOf(d) {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
}

/** "15:10" on a given day → Date */
export function at(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

/** "15:10" → "3:10", with "pm" when asked. */
export function clock(hhmmOrDate, withAmPm = true) {
  let h, m;
  if (hhmmOrDate instanceof Date) { h = hhmmOrDate.getHours(); m = hhmmOrDate.getMinutes(); }
  else [h, m] = hhmmOrDate.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${withAmPm ? ' ' + suffix : ''}`;
}

export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(d = new Date()) {
  return `${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;
}

export function relDay(d, today = new Date()) {
  const diff = Math.round((parseYmd(ymd(d)) - parseYmd(ymd(today))) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${DOW[d.getDay()]} ${MONTH[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/** Which part of the day it is, matching chore `part` values. */
export function dayPart(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
