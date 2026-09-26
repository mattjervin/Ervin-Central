// Calendar — a week at a glance, filterable by kid. School days are generated from
// data/school.json; everything else comes from data/calendar.json.

import { kids, itemsOn, forKid, weather, schoolDay, schoolOf } from '../data.js';
import { card, header, kidFilter, whoDots, empty } from '../ui.js';
import { esc, clock, addDays, startOfWeek, ymd, DOW3, MONTH } from '../util.js';

export const title = ['Family', 'Calendar'];

let who = null;
let weekOffset = 0;

export function render() {
  const ks = kids();
  const today = new Date();
  const start = addDays(startOfWeek(today), weekOffset * 7);
  const end = addDays(start, 6);
  const range = start.getMonth() === end.getMonth()
    ? `${MONTH[start.getMonth()]} ${start.getDate()}–${end.getDate()}`
    : `${MONTH[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTH[end.getMonth()].slice(0, 3)} ${end.getDate()}`;

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
    const items = forKid(itemsOn(d), who);
    const isToday = ymd(d) === ymd(today);
    const specials = ks.filter((k) => !who || k.id === who)
      .map((k) => ({ k, sp: schoolOf(k).specials?.[d.getDay()], day: schoolDay(k.school, d) }))
      .filter((x) => x.sp && x.day.type !== 'none');
    return `
      <div class="wk-day ${isToday ? 'today' : ''} ${ymd(d) < ymd(today) ? 'past' : ''}">
        <div class="wk-head"><span class="wk-dow">${DOW3[d.getDay()]}</span><span class="wk-num">${d.getDate()}</span><span class="wk-wx" data-wx="${ymd(d)}"></span></div>
        <ul class="wk-items">
          ${items.map((i) => `
            <li class="wk-item ${i.kind}">
              <span class="wk-dots">${whoDots(i.who, ks)}</span>
              <span class="wk-text"><span class="wk-title">${esc(i.icon)} ${esc(i.title)}</span>
              <span class="wk-time">${i.allDay ? 'All day' : `${clock(i.start)}${i.end > i.start ? ` – ${clock(i.end)}` : ''}`}</span></span>
            </li>`).join('') || '<li class="wk-none">Free</li>'}
          ${specials.map(({ k, sp }) => `<li class="wk-special" style="--c:${k.color}">${esc(k.name)}: ${esc(sp)}</li>`).join('')}
        </ul>
      </div>`;
  }).join('');

  return `
  <div class="stack">
    <div class="toolbar">
      ${kidFilter(ks, who)}
      <div class="wk-nav">
        <button class="btn icon" data-week="-1" aria-label="Previous week">‹</button>
        <button class="btn ghost" data-week="0">${esc(range)}</button>
        <button class="btn icon" data-week="1" aria-label="Next week">›</button>
      </div>
    </div>
    ${card(`${header(weekOffset === 0 ? 'This Week' : 'Week of ' + range)}<div class="week">${days}</div>`)}
    ${card(`${header('Adding things', { color: 'var(--t4)' })}
      <p class="muted">Events live in <code>data/calendar.json</code> in the repo — one-off <code>events</code> and weekly <code>recurring</code> items. School days, early-outs and specials come from <code>data/school.json</code>.</p>`)}
  </div>`;
}

export function mount(root, rerender) {
  root.querySelector('.pills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kid]'); if (!b) return;
    who = b.dataset.kid || null; rerender();
  });
  root.querySelector('.wk-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-week]'); if (!b) return;
    const n = Number(b.dataset.week);
    weekOffset = n === 0 ? 0 : weekOffset + n; rerender();
  });
  weather().then((w) => {
    for (const d of w.days) {
      const el = root.querySelector(`[data-wx="${d.date}"]`);
      if (el) el.innerHTML = `${d.icon} ${d.hi}°`;
    }
  }).catch(() => {});
}
