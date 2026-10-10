// Chores — DAKboard's family chore chart: every girl gets her own column, tap a chore to finish it
// and the coins pop out into the jar of the house she's at. Daily chores once a day, weekly chores
// once a week (Mon–Sun); extra chores go to that house's parent to OK first (see Coins → Waiting).

import { cfg, kids, kid as kidById, choresFor, weeklyFor, choreById, periodKey } from '../data.js';
import { store } from '../store.js';
import { card, hero, header, avatar, toast, coinBurst, empty, ring, kidEarns, jars, houseTag } from '../ui.js';
import { esc, ymd, dayPart } from '../util.js';

export const title = 'Chores';

const PARTS = [['morning', '🌅', 'Morning'], ['afternoon', '☀️', 'After school'], ['evening', '🌙', 'Evening']];

export function render(params) {
  const ks = kids();
  const one = params[0] && kidById(params[0]);
  const sel = one ? [one] : ks;
  const today = ymd();
  const left = sel.reduce((s, k) => s + choresFor(k.id).filter((c) => !store.isDone(today, c.id, k.id)).length, 0);

  return `
  ${hero(one ? `${one.name}'s chart` : 'Family chore chart', 'Chore', 'chart', left ? `${left} daily chore${left === 1 ? '' : 's'} left today. Tap one when it’s done, enter the coin code, and pick the house you’re at.` : 'Everything’s done today. Nice work! 🎉')}
  <div class="toolbar anim-fade-up">
    <div class="pills">
      <a class="choice-pill ${!one ? 'selected' : ''}" href="#/chores" style="--c:var(--acc)">Everyone</a>
      ${ks.map((k) => `<a class="choice-pill kid-pill ${one?.id === k.id ? 'selected' : ''}" href="#/chores/${k.id}" style="--c:${esc(k.color)}">${avatar(k, 'xs')}${esc(k.name)}</a>`).join('')}
    </div>
  </div>
  <div class="cols ${sel.length > 1 ? 'two' : ''}">${sel.map((k, i) => column(k, i)).join('')}</div>
  ${extras(sel, sel.length + 1)}`;
}

function column(k, i) {
  const today = ymd();
  const week = periodKey('weekly');
  const list = choresFor(k.id);
  const weekly = weeklyFor(k.id);
  const doneList = list.filter((c) => store.isDone(today, c.id, k.id));
  const weekDone = weekly.filter((c) => store.isDone(week, c.id, k.id)).length;
  const earned = doneList.reduce((s, c) => s + c.coins, 0);
  const frac = list.length ? doneList.length / list.length : 1;
  const now = dayPart();

  const groups = PARTS.map(([part, icon, label]) => {
    const items = list.filter((c) => (c.part || 'morning') === part);
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
    <div class="col-head">
      ${ring(frac, k.color, 84, 8, `<span class="ring-pct">${Math.round(frac * 100)}%</span>`)}
      <div class="col-id">${avatar(k, 'lg')}<div><div class="kid-name">${esc(k.name)}</div><div class="kid-sub">${doneList.length} of ${list.length} done today · 🪙 +${earned}</div></div></div>
    </div>
    ${jars(k)}
    ${frac === 1 && list.length ? `<div class="all-done">🎉 All done today, ${esc(k.name)}!</div>` : ''}
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
    <span class="t-coins">🪙 +${c.coins}${unit ? ` <small>a ${unit}</small>` : ''}${at ? ` ${houseTag(at)}` : ''}</span>
  </button>`;
}

function extras(sel, i) {
  const list = (cfg.chores.extra || []).filter((b) => !b.parentOnly);
  const given = (cfg.chores.extra || []).filter((b) => b.parentOnly);
  if (!list.length && !given.length) return '';
  return card(`
    ${header('Extra chores', { color: 'var(--coin)', eyebrow: 'Once a day each · tap your face when it’s done · a parent OKs it' })}
    <div class="bonus-grid">${list.map((b, j) => `
      <div class="bonus anim-row" style="--i:${j}">
        <span class="b-icon">${esc(b.icon)}</span>
        <span class="b-main"><span class="b-title">${esc(b.title)}</span><span class="b-coins">🪙 +${b.coins}</span></span>
        <span class="b-who">${sel.filter((k) => !b.who || b.who.includes(k.id)).map((k) => {
          const st = store.extraState(k.id, b.id);
          const label = st === 'done' ? 'done today' : st === 'waiting' ? 'waiting for a parent' : 'did this';
          return `<button class="b-btn ${st || ''}" data-extra="${b.id}" data-kid="${k.id}" style="--c:${esc(k.color)}" ${st ? 'disabled' : ''} aria-label="${esc(k.name)} ${label}">${avatar(k, 'sm')}${st === 'waiting' ? '<span class="b-wait">⏳</span>' : st === 'done' ? '<span class="b-wait ok">✓</span>' : ''}</button>`;
        }).join('')}</span>
      </div>`).join('')}</div>
    ${given.map((b) => `<p class="muted small">${esc(b.icon)} <b>${esc(b.title)}</b> · 🪙 +${b.coins} — a parent gives this when they catch you being kind.</p>`).join('')}`, 'bonus-card', i);
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
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
