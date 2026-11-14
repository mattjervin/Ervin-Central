// Chores — the one place for chores and coins. A tab bar picks a girl (Avery first, each tab showing
// her coins). A girl's own phone (opened from her home-screen link, see me() in data.js) starts on her
// list; a tab picked this visit sticks until the app is closed.
// The bar sticks under the top nav as she scrolls and drops down her day: % done, chores done, coins
// earned today, her two jars. Then one list of her chores:
// tap a chore to finish it and the coins pop out into the jar of the house she's at. Daily chores once
// a day, weekly (extra) chores once a week (Mon–Sun), paid the moment they are ticked.
// At the very bottom, four big fold-down buttons: extra chores (the weekly jobs), Total Coins, the
// reward shop and how she got her coins (coins.js; her last 6, then "show more") — read-only; the full ledger with ✕ lives in Parent management.

import { cfg, kid as kidById, choreKids, choresFor, weeklyFor, choreById, periodKey, houses, myKid } from '../data.js';
import { store } from '../store.js';
import { card, hero, avatar, coin, toast, coinBurst, empty, ring, kidEarns, houseTag } from '../ui.js';
import { totalCoinsCard, waitingCard, shopCard, historyCard, coinClick, foldEvents, foldCard } from './coins.js';
import { esc, ymd, dayPart } from '../util.js';

export const title = 'Chores';

// The day's routines. "timers" = the 10-minute menu (reading, math, cleaning, creative, exercise…); it's the
// "now" part in the afternoon. A part whose chores are all done folds to one line until she taps it.
const PARTS = [['morning', '🌅', 'Morning'], ['timers', '⏱️', '10-Minute Timers'], ['evening', '🌙', 'Evening']];
const NOW_PART = { morning: 'morning', afternoon: 'timers', evening: 'evening' };
const openParts = new Set();
const PICK_KEY = 'ervin-central:chore-kid';

/** The girl whose list shows: the one in the URL, else the tab picked this visit, else the girl whose
 *  device this is, else the last one picked on this device, else the first. */
function pickedKid(params) {
  let visit = null, last = null;
  try { visit = sessionStorage.getItem(PICK_KEY); last = localStorage.getItem(PICK_KEY); } catch { /* private mode */ }
  return kidById(params[0]) || kidById(visit) || myKid() || kidById(last) || choreKids()[0];
}

export function render(params) {
  const k = pickedKid(params);
  return `
  ${hero('', 'Chore', 'chart')}
  ${kidBar(k)}
  ${waitingCard(1)}
  ${list(k, 2)}
  ${extras(k, 3)}
  ${totalCoinsCard(4, { fold: true })}
  ${shopCard(6, { fold: true, kid: k })}
  ${historyCard(7, { kid: k.id, title: `How ${k.name} got her coins`, eyebrow: 'Newest first · both houses', limit: 40, removable: false, fold: true })}`;
}

/** Her day so far: today's dailies, how many are done, coins earned, and this week's progress. */
function dayStats(k) {
  const today = ymd();
  const week = periodKey('weekly');
  const daily = choresFor(k.id);
  const weekly = weeklyFor(k.id);
  const doneList = daily.filter((c) => store.isDone(today, c.id, k.id));
  return {
    today, week, daily, weekly, doneList,
    weekDone: weekly.filter((c) => store.isDone(week, c.id, k.id)).length,
    earned: doneList.reduce((s, c) => s + c.coins, 0),
    frac: daily.length ? doneList.length / daily.length : 1,
  };
}

/**
 * The girls' tabs, each with her coin total. Sticky under the top nav; once it's stuck, the picked
 * girl's day drops down under it (watchBar) — an overlay, so the list doesn't jump.
 */
function kidBar(k) {
  const st = dayStats(k);
  return `<div class="kid-bar anim-fade-up ${stuck ? 'stuck' : ''}" id="kid-bar" style="--c:${esc(k.color)}">
    <div class="kid-tabs">
      ${choreKids().map((x) => `<a class="kid-tab ${x.id === k.id ? 'selected' : ''}" href="#/chores/${x.id}" style="--c:${esc(x.color)}">${avatar(x, 'xs')}<span>${esc(x.name)}</span><span class="kt-coins">${coin()} ${store.balance(x.id)}</span></a>`).join('')}
    </div>
    <div class="kid-info">
      ${ring(st.frac, k.color, 40, 4, `<span class="ki-pct">${Math.round(st.frac * 100)}%</span>`)}
      <span class="ki-main"><b>${st.doneList.length} of ${st.daily.length} done today</b><small>${coin()} +${st.earned} today · ${st.weekDone} of ${st.weekly.length} this week</small></span>
      <span class="ki-jars">${houses().map((h) => `<span style="--h:${esc(h.color)}">${esc(h.icon)} ${esc(h.label)} <b>${store.balance(k.id, h.id)}</b></span>`).join('')}</span>
    </div>
  </div>`;
}

let watching = false;
let stuck = false; // remembered across re-renders (a tick redraws the page) so the drop-down doesn't fade in again
/** Keep the kid bar right under the top nav (which shrinks as the page scrolls) and mark it stuck. */
function watchBar() {
  const update = () => {
    const bar = document.getElementById('kid-bar');
    const nav = document.getElementById('topnav');
    if (!bar || !nav) return;
    const top = Math.round(nav.getBoundingClientRect().bottom);
    bar.style.top = `${top}px`;
    stuck = scrollY > 0 && bar.getBoundingClientRect().top <= top + 1;
    bar.classList.toggle('stuck', stuck);
  };
  if (!watching) {
    watching = true;
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    document.getElementById('topnav')?.addEventListener('transitionend', update);
  }
  update();
}

/** Today's dailies by part of the day. A part that's all done folds to a single line. */
function list(k, i) {
  const { today, daily, frac } = dayStats(k);
  const now = NOW_PART[dayPart()];

  const groups = PARTS.map(([part, icon, label]) => {
    const items = daily.filter((c) => (c.part === 'learning' ? 'timers' : c.part || 'morning') === part);
    if (!items.length) return '';
    const done = items.filter((c) => store.isDone(today, c.id, k.id));
    const coins = done.reduce((s, c) => s + c.coins, 0);
    if (done.length === items.length && !openParts.has(part)) {
      return `<button class="part-done" data-part="${part}" aria-expanded="false"><span>✅ ${icon} ${label}</span><span class="pd-n">${coin()} +${coins}</span><span class="fold-arrow" aria-hidden="true">⌄</span></button>`;
    }
    return `
      <div class="part ${part === now ? 'now' : ''}">
        <div class="part-l">${icon} ${label}${part === now ? '<span class="now-tag">Now</span>' : ''}${part === 'timers' ? '<span class="part-n">pick any · 10 minutes each</span>' : ''}</div>
        <div class="tiles">${items.map((c, j) => tile(k, c, today, j)).join('')}</div>
      </div>`;
  }).join('');

  return card(`
    ${frac === 1 && daily.length ? `<div class="all-done">🎉 All done today, ${esc(k.name)}!</div>` : ''}
    ${groups || empty('No chores today.')}
  `, 'kid-col', i, `--c:${esc(k.color)}`);
}

function tile(k, c, period, j, unit = '') {
  const done = store.isDone(period, c.id, k.id);
  const at = done ? store.doneHouse(period, c.id, k.id) : null;
  return `<button class="tile ${done ? 'done' : ''}" data-chore="${c.id}" data-kid="${k.id}" aria-pressed="${done}" style="--i:${j}">
    <span class="t-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
    <span class="t-icon">${esc(c.icon)}</span>
    <span class="t-title">${esc(c.title)}</span>
    <span class="t-coins">${at ? `${houseTag(at)} ` : ''}${coin()} +${c.coins}${unit ? ` <small>a ${unit}</small>` : ''}</span>
  </button>`;
}

/** Extra chores, behind a big button: the weekly jobs (once a week each, Mon–Sun), paid the moment they're
 *  ticked. Parent-given extras (a kindness catch) are only mentioned. */
function extras(k, i) {
  const { week, weekly, weekDone } = dayStats(k);
  const given = (cfg.chores.extra || []).filter((b) => b.parentOnly);
  if (!weekly.length && !given.length) return '';
  const body = `<div class="part weekly"><div class="tiles">${weekly.map((c, j) => tile(k, c, week, j, 'week')).join('')}</div>
    ${given.map((b) => `<p class="muted small">${esc(b.icon)} <b>${esc(b.title)}</b> · ${coin()} +${b.coins} — a parent gives this when they catch you being kind.</p>`).join('')}</div>`;
  return foldCard('extras', '⭐', 'Extra chores', `${weekDone} of ${weekly.length} done · once a week each, Mon–Sun`, body, i);
}

export function mount(root, rerender, params = []) {
  // Remember whose list this is: for this visit, and (on a shared device) for next time.
  if (kidById(params[0])) try { sessionStorage.setItem(PICK_KEY, params[0]); localStorage.setItem(PICK_KEY, params[0]); } catch { /* private mode */ }
  watchBar();
  foldEvents(root, rerender);

  root.addEventListener('click', async (e) => {
    const pd = e.target.closest('[data-part]');
    if (pd) { openParts.add(pd.dataset.part); rerender(); return; }
    if (await coinClick(e, rerender)) return;
    const t = e.target.closest('[data-chore]');
    if (t) {
      const chore = choreById(t.dataset.chore);
      const k = kidById(t.dataset.kid);
      const period = periodKey(chore.kind);
      // Ticking adds coins: the coin code, then which house. Unticking only takes them back.
      let at = null;
      if (!store.isDone(period, chore.id, k.id)) {
        at = await kidEarns(k, `get ${chore.coins} coin${chore.coins === 1 ? '' : 's'} for “${chore.title}”`);
        if (!at) return;
      }
      const r = t.getBoundingClientRect();
      const on = store.toggleChore(chore, k.id, at, period);
      if (on) coinBurst(r.left + r.width / 2, r.top, chore.coins);
      rerender();
      return;
    }
  });
}
