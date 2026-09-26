// School — per girl: today's hours, specials, and the week's lunch or breakfast menu, pulled live
// from ADM's LINQ food-service menus (with a cached copy as backup).

import { cfg, kids, schoolOf, schoolDay, menuRange } from '../data.js';
import { card, hero, header, kidFilter, segmented, avatar, chip, stat } from '../ui.js';
import { esc, clock, addDays, startOfWeek, ymd, DOW, DOW3, MONTH } from '../util.js';

export const title = 'School';

let who = null;
let meal = 'lunch';
let weekOffset = 0;

function schoolWeekStart() {
  const now = new Date();
  const bump = now.getDay() === 6 || now.getDay() === 0 || (now.getDay() === 5 && now.getHours() >= 13) ? 1 : 0;
  return addDays(startOfWeek(now), 1 + 7 * (bump + weekOffset));
}

export function render() {
  const ks = kids().filter((k) => !who || k.id === who);
  const start = schoolWeekStart();
  return `
  ${hero(`${cfg.school.district.name} · ${cfg.school.year.label}`, 'School', 'day', 'Hours, specials and what’s on the lunch tray — menus come straight from the district.')}
  <div class="toolbar anim-fade-up">
    ${kidFilter(kids(), who)}
    ${segmented('meal', [['lunch', '🍱 Lunch'], ['breakfast', '🥞 Breakfast']], meal)}
    <div class="nav-arrows">
      <button class="icon-btn" data-step="-1" aria-label="Previous week">‹</button>
      <button class="choice-pill ${weekOffset === 0 ? 'selected' : ''}" data-step="0">Week of ${MONTH[start.getMonth()].slice(0, 3)} ${start.getDate()}</button>
      <button class="icon-btn" data-step="1" aria-label="Next week">›</button>
    </div>
  </div>
  <div class="cols ${ks.length > 1 ? 'two' : ''}">${ks.map((k, i) => kidCard(k, start, i)).join('')}</div>
  <p class="footnote">Menus from LINQ Connect — subject to change.</p>`;
}

function kidCard(k, start, i) {
  const s = schoolOf(k);
  const now = new Date();
  const today = schoolDay(k.school, now);
  const todayHours = today.type === 'none' ? today.reason : `${clock(s[today.type][0], false)}–${clock(s[today.type][1], false)}`;
  const sp = s.specials?.[now.getDay()];

  return card(`
    <div class="kid-banner">${avatar(k, 'lg')}<div><div class="eyebrow" style="color:${k.color}">${esc(s.name)}</div><div class="kid-name">${esc(k.name)}</div></div></div>
    <div class="stat-row">
      ${stat(todayHours, today.type === 'early' ? 'Today · early out' : 'Today', { hero: true, color: k.color })}
      ${stat(clock(s.full[1], false), 'Mon–Thu out')}
      ${stat(clock(s.early[1], false), 'Friday out')}
      ${s.lunchTime ? stat(clock(s.lunchTime, false), 'Lunch time') : ''}
    </div>
    ${s.specials ? `
      ${header('Specials', { color: k.color, eyebrow: sp && today.type !== 'none' ? `Today: ${sp}${/PE/.test(sp) ? ' — wear sneakers 👟' : ''}` : 'Weekly rotation' })}
      <div class="specials">${[1, 2, 3, 4, 5].map((d) => `<div class="sp ${d === now.getDay() ? 'today' : ''}" style="--c:${k.color}"><span class="sp-d">${DOW3[d]}</span><span class="sp-v">${esc(s.specials[d] || '—')}</span></div>`).join('')}</div>` : ''}
    ${header(meal === 'lunch' ? 'Lunch menu' : 'Breakfast menu', { color: 'var(--amber)', eyebrow: `Week of ${start.getMonth() + 1}/${start.getDate()}` })}
    <div class="menu-week" data-menu="${k.id}" data-start="${ymd(start)}"><p class="empty">Loading menu…</p></div>
    ${s.notes?.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  `, 'kid-card', i);
}

async function fillMenu(el, k) {
  const start = new Date(el.dataset.start + 'T00:00');
  const days = await menuRange(k.school, start, 5);
  const today = ymd();
  el.innerHTML = days.map(({ date, menu }, i) => {
    const d = new Date(date + 'T00:00');
    const off = schoolDay(k.school, d);
    const meals = menu?.[meal] || [];
    const body = off.type === 'none' ? `<span class="muted">${esc(off.reason)}</span>`
      : meals.length ? meals.map((m) => meal === 'lunch' && !/hot/i.test(m.label) && !m.sides.length ? `
          <div class="meal alt"><span class="meal-l">${esc(m.label)}</span>${m.main.map((x) => chip(x.replace(/\s*\(.*\)\s*$/, ''), 'var(--amber)')).join('')}</div>` : `
          <div class="meal">
            ${meal === 'lunch' ? `<span class="meal-l">${esc(m.label)}</span>` : ''}
            ${m.main.map((x) => `<div class="meal-main">${esc(x)}</div>`).join('')}
            ${m.sides.length ? `<div class="meal-sides">${m.sides.flatMap((s) => s.items).map((x) => chip(x)).join('')}</div>` : ''}
          </div>`).join('')
      : '<span class="muted">Not posted yet</span>';
    return `<div class="menu-day anim-row ${date === today ? 'today' : ''}" style="--i:${i}"><div class="md-head"><span>${DOW[d.getDay()]}</span><span class="md-date">${date === today ? 'Today' : `${d.getMonth() + 1}/${d.getDate()}`}</span></div>${body}</div>`;
  }).join('');
}

export function mount(root, rerender) {
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kid]');
    if (k) { who = k.dataset.kid || null; return rerender(); }
    const m = e.target.closest('[data-seg="meal"] [data-val]');
    if (m) { meal = m.dataset.val; return rerender(); }
    const s = e.target.closest('[data-step]');
    if (s) { const n = Number(s.dataset.step); weekOffset = n === 0 ? 0 : weekOffset + n; rerender(); }
  });
  for (const el of root.querySelectorAll('[data-menu]')) fillMenu(el, kids().find((k) => k.id === el.dataset.menu));
}
