// School — per-girl: today's hours, this week's specials, and the lunch menu for the school week,
// pulled from ADM's LINQ food-service menus.

import { cfg, kids, schoolOf, schoolDay, menuRange } from '../data.js';
import { card, header, kidFilter, avatar, chip, empty } from '../ui.js';
import { esc, clock, addDays, startOfWeek, ymd, DOW, DOW3, relDay } from '../util.js';

export const title = ['School', 'Info'];

let who = null;
let meal = 'lunch';
let weekOffset = 0;

function schoolWeekStart() {
  const now = new Date();
  // Weekend or Friday afternoon: show next week's menu.
  const bump = now.getDay() === 6 || now.getDay() === 0 || (now.getDay() === 5 && now.getHours() >= 13) ? 1 : 0;
  return addDays(startOfWeek(now), 1 + 7 * (bump + weekOffset));
}

export function render() {
  const ks = kids().filter((k) => !who || k.id === who);
  return `
  <div class="stack">
    <div class="toolbar">
      ${kidFilter(kids(), who)}
      <div class="pills seg">
        <button class="pill ${meal === 'lunch' ? 'on' : ''}" data-meal="lunch">🍱 Lunch</button>
        <button class="pill ${meal === 'breakfast' ? 'on' : ''}" data-meal="breakfast">🥞 Breakfast</button>
      </div>
      <div class="wk-nav">
        <button class="btn icon" data-week="-1" aria-label="Previous week">‹</button>
        <button class="btn ghost" data-week="0">This week</button>
        <button class="btn icon" data-week="1" aria-label="Next week">›</button>
      </div>
    </div>
    <div class="grid two">${ks.map(kidCard).join('')}</div>
    ${card(`${header('District', { color: 'var(--t4)' })}
      <p class="muted">${esc(cfg.school.district.name)} · ${esc(cfg.school.year.label)} school year. Menus from LINQ Connect — subject to change.</p>`)}
  </div>`;
}

function kidCard(k) {
  const s = schoolOf(k);
  const now = new Date();
  const today = schoolDay(k.school, now);
  const hours = today.type === 'none' ? today.reason
    : `${clock(s[today.type][0])} – ${clock(s[today.type][1])}${today.type === 'early' ? ' · early out' : ''}`;
  const specialsToday = s.specials?.[now.getDay()];
  const start = schoolWeekStart();

  return card(`
    <div class="kid-head" style="--c:${k.color}">${avatar(k, 'lg')}<div><div class="kid-name">${esc(k.name)}</div><div class="kid-school">${esc(s.name)}</div></div></div>
    <div class="facts">
      <div class="fact"><span class="fact-l">Today</span><span class="fact-v">${esc(hours)}</span></div>
      <div class="fact"><span class="fact-l">Mon–Thu</span><span class="fact-v">${clock(s.full[0])} – ${clock(s.full[1])}</span></div>
      <div class="fact"><span class="fact-l">Friday</span><span class="fact-v">out at ${clock(s.early[1])}</span></div>
      ${s.lunchTime ? `<div class="fact"><span class="fact-l">Lunch</span><span class="fact-v">${clock(s.lunchTime)}</span></div>` : ''}
    </div>
    ${s.specials ? `
      ${header('Specials', { color: k.color })}
      <div class="specials">${[1, 2, 3, 4, 5].map((d) => `<div class="sp ${d === now.getDay() ? 'today' : ''}"><span class="sp-d">${DOW3[d]}</span><span class="sp-v">${esc(s.specials[d] || '—')}</span></div>`).join('')}</div>
      ${specialsToday && today.type !== 'none' ? `<p class="muted">Today is <b>${esc(specialsToday)}</b>${/PE/.test(specialsToday) ? ' — wear sneakers! 👟' : ''}</p>` : ''}` : ''}
    ${header(`${meal === 'lunch' ? 'Lunch' : 'Breakfast'} · week of ${start.getMonth() + 1}/${start.getDate()}`, { color: 'var(--amber)' })}
    <div class="menu-week" data-menu="${k.id}" data-start="${ymd(start)}"><p class="empty">Loading menu…</p></div>
    ${s.notes?.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  `, 'kid-card');
}

async function fillMenu(el, k) {
  const start = new Date(el.dataset.start + 'T00:00');
  const days = await menuRange(k.school, start, 5);
  const today = ymd();
  el.innerHTML = days.map(({ date, menu }) => {
    const d = new Date(date + 'T00:00');
    const off = schoolDay(k.school, d);
    const meals = menu?.[meal] || [];
    const body = off.type === 'none' ? `<span class="muted">${esc(off.reason)}</span>`
      : meals.length ? meals.map((m) => meal === 'lunch' && !/hot/i.test(m.label) && !m.sides.length ? `
          <div class="meal alt"><span class="meal-l">${esc(m.label)}</span>
            <div class="meal-sides">${m.main.map((x) => chip(x.replace(/\s*\(.*\)\s*$/, ''), 'var(--amber)')).join('')}</div>
          </div>` : `
          <div class="meal">
            ${meal === 'lunch' ? `<span class="meal-l">${esc(m.label)}</span>` : ''}
            ${m.main.map((x) => `<div class="meal-main">${esc(x)}</div>`).join('')}
            ${m.sides.length ? `<div class="meal-sides">${m.sides.flatMap((s) => s.items).map((x) => chip(x, 'var(--t3)')).join('')}</div>` : ''}
          </div>`).join('')
      : '<span class="muted">Not posted yet</span>';
    return `<div class="menu-day ${date === today ? 'today' : ''}"><div class="md-head">${DOW[d.getDay()]}<span>${date === today ? 'Today' : relDay(d).replace(/^\w+ /, '')}</span></div>${body}</div>`;
  }).join('');
}

export function mount(root, rerender) {
  root.querySelector('.pills:not(.seg)').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kid]'); if (!b) return;
    who = b.dataset.kid || null; rerender();
  });
  root.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-meal]'); if (!b) return;
    meal = b.dataset.meal; rerender();
  });
  root.querySelector('.wk-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-week]'); if (!b) return;
    const n = Number(b.dataset.week);
    weekOffset = n === 0 ? 0 : weekOffset + n; rerender();
  });
  for (const el of root.querySelectorAll('[data-menu]')) fillMenu(el, kids().find((k) => k.id === el.dataset.menu));
}
