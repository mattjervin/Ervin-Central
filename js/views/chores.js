// Chores — DAKboard's family chore chart: every girl gets her own column, tap a chore to finish it
// and the coins pop out. Extra chores go to a parent to OK first (see Coins → Waiting).

import { cfg, kids, kid as kidById, choresFor } from '../data.js';
import { store } from '../store.js';
import { card, hero, header, avatar, toast, coinBurst, empty, ring } from '../ui.js';
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
  ${hero(one ? `${one.name}'s chart` : 'Family chore chart', 'Chore', 'chart', left ? `${left} daily chore${left === 1 ? '' : 's'} left today. Tap one when it’s done — the coin lands right away. Extra chores earn 2.` : 'Everything’s done today. Nice work! 🎉')}
  <div class="toolbar anim-fade-up">
    <div class="pills">
      <a class="choice-pill ${!one ? 'selected' : ''}" href="#/chores" style="--c:var(--acc)">Everyone</a>
      ${ks.map((k) => `<a class="choice-pill kid-pill ${one?.id === k.id ? 'selected' : ''}" href="#/chores/${k.id}" style="--c:${k.color}">${avatar(k, 'xs')}${esc(k.name)}</a>`).join('')}
    </div>
  </div>
  <div class="cols ${sel.length > 1 ? 'two' : ''}">${sel.map((k, i) => column(k, i)).join('')}</div>
  ${bonus(sel, sel.length + 1)}`;
}

function column(k, i) {
  const today = ymd();
  const list = choresFor(k.id);
  const doneList = list.filter((c) => store.isDone(today, c.id, k.id));
  const earned = doneList.reduce((s, c) => s + c.coins, 0);
  const frac = list.length ? doneList.length / list.length : 1;
  const now = dayPart();

  const groups = PARTS.map(([part, icon, label]) => {
    const items = list.filter((c) => (c.part || 'morning') === part);
    if (!items.length) return '';
    return `
      <div class="part ${part === now ? 'now' : ''}">
        <div class="part-l">${icon} ${label}${part === now ? '<span class="now-tag">Now</span>' : ''}</div>
        <div class="tiles">${items.map((c, j) => tile(k, c, store.isDone(today, c.id, k.id), j)).join('')}</div>
      </div>`;
  }).join('');

  return card(`
    <div class="col-head">
      ${ring(frac, k.color, 84, 8, `<span class="ring-pct">${Math.round(frac * 100)}%</span>`)}
      <div class="col-id">${avatar(k, 'lg')}<div><div class="kid-name">${esc(k.name)}</div><div class="kid-sub">${doneList.length} of ${list.length} done · 🪙 +${earned} today</div></div></div>
      <div class="col-bal"><span class="cb-l">Coins</span><span class="cb-v">🪙 <b data-count="${store.balance(k.id)}">${store.balance(k.id)}</b></span></div>
    </div>
    ${frac === 1 && list.length ? `<div class="all-done">🎉 All done today, ${esc(k.name)}!</div>` : ''}
    ${groups || empty('No chores today.')}
  `, 'kid-col', i, `--c:${k.color}`);
}

function tile(k, c, done, j) {
  return `<button class="tile ${done ? 'done' : ''}" data-chore="${c.id}" data-kid="${k.id}" aria-pressed="${done}" style="--i:${j}">
    <span class="t-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
    <span class="t-icon">${esc(c.icon)}</span>
    <span class="t-title">${esc(c.title)}</span>
    <span class="t-coins">🪙 +${c.coins}</span>
  </button>`;
}

function bonus(sel, i) {
  return card(`
    ${header('Extra chores', { color: 'var(--coin)', eyebrow: 'Earn extra coins · tap your face when it’s done · a parent OKs it' })}
    <div class="bonus-grid">${cfg.chores.bonus.map((b, j) => `
      <div class="bonus anim-row" style="--i:${j}">
        <span class="b-icon">${esc(b.icon)}</span>
        <span class="b-main"><span class="b-title">${esc(b.title)}</span><span class="b-coins">🪙 +${b.coins}</span></span>
        <span class="b-who">${sel.map((k) => {
          const waiting = store.pendingFor(k.id).filter((p) => p.type === 'bonus' && p.ref === b.id).length;
          return `<button class="b-btn" data-bonus="${b.id}" data-kid="${k.id}" style="--c:${k.color}" aria-label="${esc(k.name)} did this">${avatar(k, 'sm')}${waiting ? `<span class="b-wait">${waiting}</span>` : ''}</button>`;
        }).join('')}</span>
      </div>`).join('')}</div>`, 'bonus-card', i);
}

export function mount(root, rerender) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chore]');
    if (t) {
      const chore = cfg.chores.chores.find((c) => c.id === t.dataset.chore);
      const on = store.toggleChore(chore, t.dataset.kid);
      if (on) { const r = t.getBoundingClientRect(); coinBurst(r.left + r.width / 2, r.top, chore.coins); }
      rerender();
      return;
    }
    const b = e.target.closest('[data-bonus]');
    if (b) {
      const k = kidById(b.dataset.kid);
      const item = cfg.chores.bonus.find((x) => x.id === b.dataset.bonus);
      store.request(k.id, 'bonus', item);
      toast(`${esc(item.icon)} Sent to a parent — nice, ${esc(k.name)}!`, k.color);
      rerender();
    }
  });
}
