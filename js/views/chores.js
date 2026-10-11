// Chores — the one place for chores and coins. A tab bar picks a girl (Avery first, each tab showing
// her coins). A girl's own phone (opened from her home-screen link, see me() in data.js) starts on her
// list; a tab picked this visit sticks until the app is closed.
// The bar sticks under the top nav as she scrolls and drops down her day: % done, chores done, coins
// earned today, her two jars. Then one list of her chores:
// tap a chore to finish it and the coins pop out into the jar of the house she's at. Daily chores once
// a day, weekly chores once a week (Mon–Sun); extra chores go to that house's parent to OK first.
// Then the reward shop, Total Coins and, at the very bottom, how she got her coins (coins.js) — read-only;
// the full ledger with ✕ lives in Parent management.

import { cfg, kid as kidById, choreKids, choresFor, weeklyFor, choreById, periodKey, houses, myKid } from '../data.js';
import { store } from '../store.js';
import { card, hero, avatar, coin, toast, coinBurst, empty, ring, kidEarns, houseTag } from '../ui.js';
import { totalCoinsCard, waitingCard, shopCard, historyCard, coinClick } from './coins.js';
import { esc, ymd, dayPart } from '../util.js';

export const title = 'Chores';

const PARTS = [['morning', '🌅', 'Morning'], ['afternoon', '☀️', 'After school'], ['evening', '🌙', 'Evening']];
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
  ${shopCard(4)}
  ${totalCoinsCard(5)}
  ${historyCard(6, { kid: k.id, title: `How ${k.name} got her coins`, eyebrow: 'Newest first · both houses', limit: 40, removable: false })}`;
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

/** One list: today's dailies by part of the day, then this week's chores. */
function list(k, i) {
  const { today, week, daily, weekly, weekDone, frac } = dayStats(k);
  const now = dayPart();

  const groups = PARTS.map(([part, icon, label]) => {
    const items = daily.filter((c) => (c.part || 'morning') === part);
    if (!items.length) return '';
    return `
      <div class="part ${part === now ? 'now' : ''}">
        <div class="part-l">${icon} ${label}${part === now ? '<span class="now-tag">Now</span>' : ''}</div>
        <div class="tiles">${items.map((c, j) => tile(k, c, today, j)).join('')}</div>
      </div>`;
  }).join('');

  const weekGroup = weekly.length ? `
      <div class="part weekly">
        <div class="part-l">📅 This week<span class="part-n">${weekDone} of ${weekly.length} · once a week, Mon–Sun</span></div>
        <div class="tiles">${weekly.map((c, j) => tile(k, c, week, j, 'week')).join('')}</div>
      </div>` : '';

  return card(`
    ${frac === 1 && daily.length ? `<div class="all-done">🎉 All done today, ${esc(k.name)}!</div>` : ''}
    ${groups || empty('No chores today.')}
    ${weekGroup}
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

/** Her extra chores, as rows: tap when it's done and it goes to that house's parent to OK. */
function extras(k, i) {
  const asks = (cfg.chores.extra || []).filter((b) => !b.parentOnly && (!b.who || b.who.includes(k.id)));
  const given = (cfg.chores.extra || []).filter((b) => b.parentOnly);
  if (!asks.length && !given.length) return '';
  return card(`
    <div class="part">
      <div class="part-l">⭐ Extra chores<span class="part-n">once a day each · a parent OKs it</span></div>
      <div class="tiles">${asks.map((b, j) => {
        const st = store.extraState(k.id, b.id);
        return `<button class="tile extra ${st || ''}" data-extra="${b.id}" data-kid="${k.id}" ${st ? 'disabled' : ''} style="--i:${j}">
          <span class="t-check">${st === 'waiting' ? '⏳' : st === 'done' ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</span>
          <span class="t-icon">${esc(b.icon)}</span>
          <span class="t-title">${esc(b.title)}${st === 'waiting' ? '<small>Waiting for a parent</small>' : st === 'done' ? '<small>OK’d today</small>' : ''}</span>
          <span class="t-coins">${coin()} +${b.coins}</span>
        </button>`;
      }).join('')}</div>
      ${given.map((b) => `<p class="muted small">${esc(b.icon)} <b>${esc(b.title)}</b> · ${coin()} +${b.coins} — a parent gives this when they catch you being kind.</p>`).join('')}
    </div>`, 'kid-col extras-card', i, `--c:${esc(k.color)}`);
}

export function mount(root, rerender, params = []) {
  // Remember whose list this is: for this visit, and (on a shared device) for next time.
  if (kidById(params[0])) try { sessionStorage.setItem(PICK_KEY, params[0]); localStorage.setItem(PICK_KEY, params[0]); } catch { /* private mode */ }
  watchBar();

  root.addEventListener('click', async (e) => {
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
    const b = e.target.closest('[data-extra]');
    if (b) {
      const k = kidById(b.dataset.kid);
      const item = choreById(b.dataset.extra);
      if (store.extraState(k.id, item.id)) return;
      const at = await kidEarns(k, `send “${item.title}” to a parent`);
      if (!at) return;
      store.request(k.id, 'bonus', item, at);
      toast(`${esc(item.icon)} Sent to a parent — nice, ${esc(k.name)}!`, k.color);
      rerender();
    }
  });
}
