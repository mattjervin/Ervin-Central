// Home — the wall display's resting screen, and Life Command's opposite number from ErvOS:
// greeting, clock, one plain sentence about the day, then a card per question the family asks
// in the kitchen (what's happening, what's for lunch, what's left to do, who has how many coins).

import { cfg, kids, itemsOn, upcoming, choresFor, menuRange, lunchHeadline, weather, schoolDay, schoolOf } from '../data.js';
import { store } from '../store.js';
import { card, header, stat, empty, avatar, whoDots, chip } from '../ui.js';
import { esc, greeting, longDate, clock, ymd, relDay, plural, dayPart } from '../util.js';

export const title = ['Ervin', 'Central'];

export function render() {
  const now = new Date();
  const today = ymd(now);
  const ks = kids();

  const choreStats = ks.map((k) => {
    const list = choresFor(k.id, now);
    const done = list.filter((c) => store.isDone(today, c.id, k.id)).length;
    return { k, list, done, left: list.length - done };
  });
  const next = upcoming(2, now).filter((i) => i.kind !== 'school' || i.start > now)[0];

  return `
  <div class="stack">
    ${card(`
      <div class="hero">
        <div>
          <div class="hero-greet">${esc(greeting(now))}, ${esc(cfg.family.family)}s</div>
          <div class="hero-date">${esc(longDate(now).toUpperCase())}</div>
        </div>
        <div class="hero-right">
          <div class="hero-wx" id="home-wx"></div>
          <div class="hero-clock" data-clock></div>
        </div>
      </div>
      <p class="hero-syn">${esc(synthesis(now, choreStats))}</p>`, 'hero-card')}

    <div class="stats">
      ${choreStats.map(({ k, left }) => stat(left, `${k.name}'s chores left`, left ? k.color : 'var(--good)')).join('')}
      ${stat(next ? (next.allDay ? relDay(next.date) : clock(next.start, false)) : '—', next ? `Next · ${next.title}` : 'Nothing coming up', 'var(--acc)')}
      ${ks.map((k) => stat(store.balance(k.id), `${k.name}'s coins`, 'var(--coin)')).join('')}
    </div>

    <div class="grid">
      ${scheduleCard(now)}
      ${lunchCard(now)}
      ${choresCard(choreStats)}
      ${coinsCard()}
    </div>
  </div>`;
}

export function mount(root) {
  weather().then((w) => {
    const el = root.querySelector('#home-wx');
    if (!el) return;
    const t = w.days[0];
    el.innerHTML = `<span class="wx-icon">${w.now.icon}</span><span class="wx-temp">${w.now.temp}°</span><span class="wx-hl">${t.hi}° / ${t.lo}°${t.rain >= 30 ? ` · ${t.rain}% rain` : ''}</span>`;
  }).catch(() => {});

  // Lunch loads async (cache, then live LINQ if the cache is missing a day).
  const slot = root.querySelector('#home-lunch');
  if (slot) lunchBody(new Date()).then((html) => { slot.innerHTML = html; });
}

// ---- Synthesis ------------------------------------------------------------------------------

/** One sentence from numbers already on screen — what they mean together. */
function synthesis(now, choreStats) {
  const parts = [];
  const ks = kids();
  const dayTypes = ks.map((k) => schoolDay(k.school, now));
  if (dayTypes.every((d) => d.type === 'none')) parts.push(dayTypes[0].reason === 'Weekend' ? 'No school today' : dayTypes[0].reason);
  else if (dayTypes.some((d) => d.type === 'early')) {
    const outs = ks.map((k) => `${k.name} ${clock(schoolOf(k).early[1])}`).join(', ');
    parts.push(`Early out today — ${outs}`);
  }

  const next = upcoming(1, now).find((i) => i.kind !== 'school' && !i.allDay && i.start > now);
  if (next) parts.push(`${next.title} at ${clock(next.start)}`);

  const left = choreStats.filter((c) => c.left);
  if (!left.length && choreStats.some((c) => c.list.length)) parts.push('Every chore is done — nice work');
  else if (left.length) parts.push(left.map((c) => `${c.k.name} has ${plural(c.left, 'chore')} left`).join(', '));

  const pend = store.allPending().length;
  if (pend) parts.push(`${plural(pend, 'request')} waiting on a parent`);
  return parts.join(' · ') || 'A quiet day.';
}

// ---- Cards ----------------------------------------------------------------------------------

function scheduleCard(now) {
  const rest = itemsOn(now).filter((i) => i.allDay || i.end > now);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const late = now.getHours() >= 19;
  const list = late ? itemsOn(tomorrow) : rest;
  const ks = kids();
  const rows = list.map((i) => `
    <li class="row">
      <span class="row-time">${i.allDay ? 'All day' : clock(i.start, false)}</span>
      <span class="row-icon">${esc(i.icon)}</span>
      <span class="row-main"><span class="row-title">${esc(i.title)}</span>${i.detail ? `<span class="row-sub">${esc(i.detail)}</span>` : ''}</span>
      <span class="row-dots">${whoDots(i.who, ks)}</span>
    </li>`).join('');
  return card(`
    ${header(late ? 'Tomorrow' : 'Today', { badge: list.length || null, href: '#/calendar' })}
    ${rows ? `<ul class="rows">${rows}</ul>` : empty(late ? 'Nothing on the calendar tomorrow.' : 'Nothing else on the calendar today.')}`);
}

function lunchCard(now) {
  // After lunch is over, look ahead to the next school day.
  return card(`${header('School Lunch', { color: 'var(--amber)', href: '#/school' })}<div id="home-lunch"><p class="empty">Loading menu…</p></div>`);
}

async function lunchBody(now) {
  const ks = kids();
  let day = new Date(now);
  if (now.getHours() >= 13) day.setDate(day.getDate() + 1);
  for (let i = 0; i < 7 && ks.every((k) => schoolDay(k.school, day).type === 'none'); i++) day.setDate(day.getDate() + 1);
  const label = relDay(day, now);
  const rows = await Promise.all(ks.map(async (k) => {
    const [{ menu }] = await menuRange(k.school, day, 1);
    const off = schoolDay(k.school, day).type === 'none';
    const main = off ? 'No school' : lunchHeadline(menu) || 'Menu not posted yet';
    return `<li class="lunch-row" style="--c:${k.color}">${avatar(k)}<div><div class="lunch-kid">${esc(k.name)} · ${esc(schoolOf(k).short)}</div><div class="lunch-main">${esc(main)}</div></div></li>`;
  }));
  return `<div class="card-kicker">${esc(label)}</div><ul class="lunch-rows">${rows.join('')}</ul>`;
}

function choresCard(choreStats) {
  const part = dayPart();
  const body = choreStats.map(({ k, list, done }) => {
    const pct = list.length ? Math.round((done / list.length) * 100) : 100;
    const now = list.filter((c) => (c.part || 'morning') === part && !store.isDone(ymd(), c.id, k.id)).slice(0, 3);
    return `
      <a class="kid-progress" href="#/chores/${k.id}" style="--c:${k.color}">
        <div class="kp-head">${avatar(k)}<span class="kp-name">${esc(k.name)}</span><span class="kp-count">${done}/${list.length}</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        ${now.length ? `<div class="kp-next">${now.map((c) => chip(`${c.icon} ${c.title}`, k.color)).join('')}</div>` : ''}
      </a>`;
  }).join('');
  return card(`${header('Chores', { color: 'var(--good)', href: '#/chores' })}${body}`);
}

function coinsCard() {
  const ks = kids();
  const max = Math.max(1, ...ks.map((k) => store.balance(k.id)));
  const pend = store.allPending().length;
  return card(`
    ${header(cfg.chores.coinName, { color: 'var(--coin)', href: '#/coins', badge: pend ? `${pend} waiting` : null, badgeColor: 'var(--amber)' })}
    ${ks.map((k) => {
      const b = store.balance(k.id);
      return `<div class="coin-line" style="--c:${k.color}">${avatar(k)}<span class="cl-name">${esc(k.name)}</span>
        <div class="bar coin"><span style="width:${Math.max(4, (b / max) * 100)}%"></span></div>
        <span class="cl-val">🪙 ${b}</span></div>`;
    }).join('')}`);
}
