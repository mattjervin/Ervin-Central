// Grandparents Central — one page to send Grandma and Grandpa: the girls' games, shows, birthdays and
// birthday parties for the next year, nothing they wouldn't come to (no practices, no school days).
// Big type, names spelled out instead of color codes, and an "add to my calendar" button on each.
// Reached from the bottom of the full calendar; what's on it is decided in data.js grandparentItems().

import { kids, grandparentItems, placeFor, placeTown, mapsUrl } from '../data.js';
import { card, hero, header, kidFilter, whoColor, toast, modal } from '../ui.js';
import { esc, clock, ymd, relDay, DOW, DOW3, MONTH } from '../util.js';

export const title = 'Grandparents Central';

let who = null;
let shown = []; // what render() listed, so each 📅 button's index finds its item

const time = (x) => (x.allDay ? 'All day' : `${clock(x.start)}${x.end > x.start ? ` – ${clock(x.end)}` : ''}`);
const longDay = (d) => `${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;

/** "Evelynn", "Evelynn & Avery" — spelled out, Grandpa shouldn't need the color key. */
function names(x) {
  const ks = kids();
  const list = x.who.length ? x.who.map((id) => ks.find((k) => k.id === id)).filter(Boolean) : ks;
  return list.map((k) => `<span class="gp-kid" style="--c:${esc(k.color)}"><span class="pdot"></span>${esc(k.name)}</span>`).join('');
}

/** "in 6 days" from today, by calendar day. */
function until(d, today) {
  const n = Math.round((new Date(ymd(d) + 'T00:00') - new Date(ymd(today) + 'T00:00')) / 864e5);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`;
}

/** "Island Park · Field 4A" — the event's own place text when it names the venue, else the venue's name. */
function whereText(x, p) {
  const named = (p.match || [p.name]).some((m) => (x.detail || '').toLowerCase().includes(m.toLowerCase()));
  return named ? x.detail : [p.name, x.detail].filter(Boolean).join(' · ');
}

/** The location part of an event's line: "Island Park · Field 4A · Adel, IA" — the field matters for
 *  games; the street address is left to the Map button. */
export function placeLine(x) {
  const p = placeFor(x);
  if (!p) return x.detail || '';
  const text = whereText(x, p);
  const city = placeTown(p);
  return city && !text.toLowerCase().includes(city.split(',')[0].toLowerCase()) ? `${text} · ${city}` : text;
}

/** The small 🗺️ Map button beside 📅 Add: Apple Maps on Apple devices, Google Maps elsewhere. */
function mapBtn(x) {
  const p = placeFor(x);
  return p ? `<a class="gp-add gp-map" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener" aria-label="Map to ${esc(p.name)}"><span aria-hidden="true">🗺️</span><span class="gp-add-l">Map</span></a>` : '';
}

/** What goes in a calendar event's location: the place text plus its street address, so the
 *  grandparents' calendar app can map it. */
export function icsLocation(x) {
  const p = placeFor(x);
  if (!p) return x.detail || '';
  return [whereText(x, p), p.address || p.city].filter(Boolean).join(', ');
}

/** The line under a title: when · where (place, field, city). */
const subLine = (x) => [time(x), placeLine(x)].filter(Boolean).join(' · ');

/** Add and Map, stacked on the right of every event. */
const actions = (x, i) => `<div class="gp-acts">${addBtn(i)}${mapBtn(x)}</div>`;

const addBtn = (i, label = 'Add to my calendar') =>
  `<button class="gp-add" data-ics="${i}" aria-label="${esc(label)}"><span aria-hidden="true">📅</span><span class="gp-add-l">Add</span></button>`;

export function render() {
  const ks = kids();
  const today = new Date();
  const items = shown = grandparentItems(today).filter((x) => !who || !x.who.length || x.who.includes(who));
  const [next] = items;
  const rel = next && relDay(next.date, today);

  const nextCard = next ? card(`
    ${header('Next up', { color: whoColor(next.who, ks), eyebrow: until(next.date, today) })}
    <div class="gp-next" style="--c:${esc(whoColor(next.who, ks))}">
      <div class="gp-next-icon" aria-hidden="true">${esc(next.icon)}</div>
      <div class="gp-next-main">
        <div class="gp-next-title">${esc(next.title)}</div>
        <div class="gp-next-when">${esc(['Today', 'Tomorrow'].includes(rel) ? `${rel} · ${longDay(next.date)}` : longDay(next.date))}</div>
        <div class="gp-next-sub">${esc(subLine(next))}</div>
        <div class="gp-kids">${names(next)}</div>
      </div>
      ${actions(next, 0)}
    </div>`, 'gp-next-card', 1) : '';

  // One card per month, rows in date order.
  const months = new Map();
  items.forEach((x, i) => {
    const k = `${x.date.getFullYear()}-${x.date.getMonth()}`;
    if (!months.has(k)) months.set(k, { d: x.date, rows: [] });
    months.get(k).rows.push({ x, i });
  });
  const list = [...months.values()].map(({ d, rows }, m) => card(`
    ${header(`${MONTH[d.getMonth()]} ${d.getFullYear()}`, { badge: rows.length, eyebrow: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() ? 'This month' : '' })}
    ${rows.map(({ x, i }, j) => `
      <div class="gp-row anim-row ${esc(x.kind)}" style="--c:${esc(whoColor(x.who, ks))};--i:${j}">
        <div class="gp-date"><span class="gp-dow">${DOW3[x.date.getDay()]}</span><span class="gp-day">${x.date.getDate()}</span></div>
        <div class="gp-main">
          <div class="gp-title"><span aria-hidden="true">${esc(x.icon)}</span> ${esc(x.title)}</div>
          <div class="gp-sub">${esc(subLine(x))}</div>
          <div class="gp-kids">${names(x)}</div>
        </div>
        ${actions(x, i)}
      </div>`).join('')}`, 'gp-month', Math.min(m + 2, 8))).join('');

  return `
  ${hero('For Grandma & Grandpa', 'Grandparents', 'Central',
    `Games, shows and birthdays for ${ks.map((k) => `<b>${esc(k.name)}</b>`).join(' and ')} — the things worth coming to. Tap <b>📅 Add</b> to put one on your own calendar.`)}
  <div class="toolbar anim-fade-up">${kidFilter(ks, who)}</div>
  ${nextCard}
  ${list || card('<p class="empty">Nothing on the calendar yet — check back soon.</p>', '', 1)}
  ${items.length ? `<div class="gp-foot anim-fade-up">
    <button class="btn ok" data-ics="all">📅 Add all ${items.length} to my calendar</button>
    <button class="btn ghost" data-share>📤 Share this page</button>
  </div>` : ''}`;
}

// ---- Share ----------------------------------------------------------------------------------------
// Shares …/Ervin-Central/grandparents/ — a plain path (grandparents/index.html forwards to this page)
// rather than a #fragment, which texts and some share targets drop. Building it from the page's own
// address also survives the ?r=… a refreshed home-screen app carries (that used to cut the link back
// to the homepage).

export const shareUrl = (href = location.href) => new URL('grandparents/', href).href;

async function share() {
  const url = shareUrl();
  const data = { title: 'Grandparents Central', text: 'The girls’ games, shows and birthdays', url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (err) { if (err?.name === 'AbortError') return; /* else fall back */ }
  }
  try { await navigator.clipboard.writeText(url); toast('🔗 Link copied — paste it in a text'); return; } catch { /* no clipboard */ }
  modal(`
    <div class="sheet-icon">🔗</div>
    <h3 class="sheet-title">Grandparents Central</h3>
    <p class="sheet-sub">Copy this link and text it to Grandma & Grandpa:</p>
    <input class="share-url" type="text" readonly value="${esc(url)}" aria-label="Link to share">
    <button class="btn ghost wide" data-close>Done</button>`, {
    onMount(sheet) { const i = sheet.querySelector('.share-url'); i.focus(); i.select(); },
  });
}

// ---- Add to calendar (.ics) ---------------------------------------------------------------------
// Times are "floating" (no time zone), the same way the site shows them: 9:00 am is 9:00 am where
// the phone is, which for the grandparents is Iowa.

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d) => `${ymd(d).replace(/-/g, '')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
/** Lines over 75 octets fold onto continuation lines starting with a space (RFC 5545 3.1). */
const fold = (line) => {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  return [...out, cur].join('\r\n');
};

function ics(list) {
  const ks = kids();
  const now = new Date();
  const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ervin Central//Grandparents Central//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const x of list) {
    const who = (x.who.length ? x.who.map((id) => ks.find((k) => k.id === id)?.name) : ks.map((k) => k.name)).filter(Boolean).join(' & ');
    const day = ymd(x.date).replace(/-/g, '');
    const slug = x.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    lines.push('BEGIN:VEVENT', `UID:${day}-${slug}@ervin-central`, `DTSTAMP:${utc}`);
    if (x.allDay) {
      const next = new Date(x.date.getFullYear(), x.date.getMonth(), x.date.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${ymd(next).replace(/-/g, '')}`);
    } else {
      lines.push(`DTSTART:${stamp(x.start)}`, `DTEND:${stamp(x.end > x.start ? x.end : new Date(+x.start + 60 * 60e3))}`);
    }
    lines.push(`SUMMARY:${icsText(`${x.icon} ${x.title}`)}`);
    const loc = icsLocation(x);
    if (loc) lines.push(`LOCATION:${icsText(loc)}`);
    lines.push(`DESCRIPTION:${icsText(`${who}${x.tentative ? ' · not confirmed yet' : ''} · from Grandparents Central`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function download(list, name) {
  const url = URL.createObjectURL(new Blob([ics(list)], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kid]');
    if (k) { who = k.dataset.kid || null; return rerender(); }
    const add = e.target.closest('[data-ics]');
    if (add) {
      if (add.dataset.ics === 'all') return download(shown, 'Ervin girls - games and birthdays');
      const x = shown[Number(add.dataset.ics)];
      if (x) download([x], `${x.title} ${ymd(x.date)}`);
      return;
    }
    if (e.target.closest('[data-share]')) share();
  });
}
