// Calendar — DAKboard's three family views: Agenda (by day), Week (seven columns), and Month
// (big date grid). Color-coded per girl, filterable, with a legend. Tap a month day for its details.
// School days come from data/school.json; everything else from data/calendar.json.

import { kids, itemsOn, forKid, weather, schoolDay, schoolOf } from '../data.js';
import { card, hero, kidFilter, segmented, whoDots, whoColor, modal } from '../ui.js';
import { esc, clock, addDays, startOfWeek, ymd, relDay, DOW, DOW3, MONTH } from '../util.js';

export const title = 'Calendar';

let who = null;
let view = 'week';
let offset = 0;   // weeks (week/agenda) or months (month) from now

const time = (i) => (i.allDay ? 'All day' : `${clock(i.start)}${i.end > i.start ? ` – ${clock(i.end)}` : ''}`);

export function render() {
  const ks = kids();
  const today = new Date();
  const { label, body } = view === 'month' ? month(today) : view === 'agenda' ? agenda(today) : week(today);

  return `
  ${hero('Family calendar', 'What’s', 'happening', `${ks.map((k) => `<span class="legend" style="--c:${k.color}"><span class="pdot"></span>${esc(k.name)}</span>`).join('')}<span class="legend" style="--c:var(--acc)"><span class="pdot"></span>Family</span>`)}
  <div class="toolbar anim-fade-up">
    ${segmented('view', [['agenda', 'Agenda'], ['week', 'Week'], ['month', 'Month']], view)}
    ${kidFilter(ks, who)}
    <div class="nav-arrows">
      <button class="icon-btn" data-step="-1" aria-label="Previous">‹</button>
      <button class="choice-pill ${offset === 0 ? 'selected' : ''}" data-step="0">${esc(label)}</button>
      <button class="icon-btn" data-step="1" aria-label="Next">›</button>
    </div>
  </div>
  ${body}`;
}

// ---- Week ---------------------------------------------------------------------------------------

function week(today) {
  const ks = kids();
  // A rolling week (DAKboard-style): today first, so a Saturday screen isn't mostly past days.
  const start = addDays(today, offset * 7);
  const end = addDays(start, 6);
  const label = offset === 0 ? 'Next 7 days' : `${MONTH[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTH[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
  const cols = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => {
    const items = forKid(itemsOn(d), who);
    const isToday = ymd(d) === ymd(today);
    const specials = ks.filter((k) => !who || k.id === who)
      .map((k) => ({ k, sp: schoolOf(k).specials?.[d.getDay()], day: schoolDay(k.school, d) }))
      .filter((x) => x.sp && x.day.type !== 'none');
    return `
      <div class="wk-day ${isToday ? 'today' : ''} ${ymd(d) < ymd(today) ? 'past' : ''}" style="--i:${i}">
        <div class="wk-head"><span class="wk-dow">${DOW3[d.getDay()]}</span><span class="wk-num">${d.getDate()}</span><span class="wk-wx" data-wx="${ymd(d)}"></span></div>
        <div class="wk-items">
          ${items.map((x) => `
            <div class="ev ${x.kind}" style="--c:${whoColor(x.who, ks)}">
              <span class="ev-t">${esc(x.icon)} ${esc(x.title)}</span><span class="ev-time">${time(x)}</span>
              ${x.who.length > 1 ? `<span class="ev-dots">${whoDots(x.who, ks)}</span>` : ''}
            </div>`).join('') || '<div class="ev-free">Free</div>'}
          ${specials.map(({ k, sp }) => `<div class="special" style="--c:${k.color}">${esc(k.name)} · ${esc(sp)}</div>`).join('')}
        </div>
      </div>`;
  }).join('');
  return { label, body: card(`<div class="week">${cols}</div>`, 'week-card', 1) };
}

// ---- Agenda -------------------------------------------------------------------------------------

function agenda(today) {
  const ks = kids();
  const start = offset === 0 ? today : addDays(startOfWeek(today), offset * 7);
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const label = offset === 0 ? 'Next 2 weeks' : `From ${MONTH[start.getMonth()].slice(0, 3)} ${start.getDate()}`;
  const body = days.map((d, i) => {
    const items = forKid(itemsOn(d), who);
    if (!items.length) return '';
    return card(`
      <div class="agl-head"><span class="agl-day">${esc(relDay(d, today))}</span><span class="agl-date">${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}</span></div>
      ${items.map((x, j) => `
        <div class="agl-item anim-row" style="--c:${whoColor(x.who, ks)};--i:${j}">
          <span class="agl-time">${x.allDay ? 'All day' : clock(x.start)}</span>
          <span class="agl-icon">${esc(x.icon)}</span>
          <span class="agl-main"><span class="agl-title">${esc(x.title)}</span><span class="agl-sub">${esc([x.detail, x.allDay ? '' : time(x)].filter(Boolean).join(' · '))}</span></span>
          <span class="row-dots">${whoDots(x.who, ks)}</span>
        </div>`).join('')}`, 'agl-card', Math.min(i, 8));
  }).join('');
  return { label, body: `<div class="agenda-list">${body}</div>` };
}

// ---- Month --------------------------------------------------------------------------------------

function month(today) {
  const ks = kids();
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i)).map((d, i) => {
    const items = forKid(itemsOn(d), who).filter((x) => x.kind !== 'school');
    const school = forKid(itemsOn(d), who).some((x) => x.kind === 'school');
    const out = d.getMonth() !== first.getMonth();
    return `
      <button class="mo-cell ${out ? 'out' : ''} ${ymd(d) === ymd(today) ? 'today' : ''}" data-day="${ymd(d)}" style="--i:${Math.min(i, 20)}">
        <span class="mo-num">${d.getDate()}</span>${school ? '<span class="mo-school" title="School day">🏫</span>' : ''}
        <span class="mo-evs">${items.slice(0, 3).map((x) => `<span class="mo-ev" style="--c:${whoColor(x.who, ks)}">${esc(x.icon)} ${esc(x.title)}</span>`).join('')}
        ${items.length > 3 ? `<span class="mo-more">+${items.length - 3} more</span>` : ''}</span>
      </button>`;
  }).join('');
  const label = `${MONTH[first.getMonth()]} ${first.getFullYear()}`;
  return { label, body: card(`<div class="mo-dow">${DOW3.map((d) => `<span>${d}</span>`).join('')}</div><div class="month">${cells}</div>`, 'month-card', 1) };
}

function dayDetail(key) {
  const ks = kids();
  const d = new Date(key + 'T00:00');
  const items = forKid(itemsOn(d), who);
  modal(`
    <div class="eyebrow">${esc(relDay(d))}</div>
    <h3 class="sheet-title">${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}</h3>
    <div class="sheet-list">${items.map((x) => `
      <div class="agl-item" style="--c:${whoColor(x.who, ks)}"><span class="agl-time">${x.allDay ? 'All day' : clock(x.start)}</span><span class="agl-icon">${esc(x.icon)}</span>
      <span class="agl-main"><span class="agl-title">${esc(x.title)}</span><span class="agl-sub">${esc(x.detail || time(x))}</span></span><span class="row-dots">${whoDots(x.who, ks)}</span></div>`).join('') || '<p class="empty">Nothing planned.</p>'}</div>
    <button class="btn ghost wide" data-close>Close</button>`);
}

export function mount(root, rerender) {
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kid]');
    if (k) { who = k.dataset.kid || null; return rerender(); }
    const v = e.target.closest('[data-seg="view"] [data-val]');
    if (v) { view = v.dataset.val; offset = 0; return rerender(); }
    const s = e.target.closest('[data-step]');
    if (s) { const n = Number(s.dataset.step); offset = n === 0 ? 0 : offset + n; return rerender(); }
    const day = e.target.closest('[data-day]');
    if (day) dayDetail(day.dataset.day);
  });
  weather().then((w) => {
    for (const d of w.days) {
      const el = root.querySelector(`[data-wx="${d.date}"]`);
      if (el) el.innerHTML = `${d.icon} ${d.hi}°`;
    }
  }).catch(() => {});
}
