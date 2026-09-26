// Chores — each girl taps her face, then taps a chore to tick it off. Coins land instantly for
// daily chores; bonus tasks go to a parent to OK first (see Coins → Waiting).

import { cfg, kids, kid as kidById, choresFor } from '../data.js';
import { store } from '../store.js';
import { card, header, avatar, toast, coinBurst, empty } from '../ui.js';
import { esc, ymd, dayPart } from '../util.js';

export const title = ['Chore', 'Chart'];

const PARTS = [['morning', '🌅 Morning'], ['afternoon', '☀️ After school'], ['evening', '🌙 Evening']];

export function render(params) {
  const ks = kids();
  const sel = params[0] && kidById(params[0]) ? [kidById(params[0])] : ks;
  return `
  <div class="stack">
    <div class="kid-picker">
      <a class="kp-btn ${sel.length > 1 ? 'on' : ''}" href="#/chores" style="--c:var(--acc)"><span class="avatar">👨‍👧‍👧</span>Everyone</a>
      ${ks.map((k) => `<a class="kp-btn ${sel.length === 1 && sel[0].id === k.id ? 'on' : ''}" href="#/chores/${k.id}" style="--c:${k.color}">${avatar(k)}${esc(k.name)}</a>`).join('')}
    </div>
    <div class="grid ${sel.length > 1 ? 'two' : ''}">${sel.map((k) => kidColumn(k, sel.length === 1)).join('')}</div>
  </div>`;
}

function kidColumn(k, solo) {
  const today = ymd();
  const list = choresFor(k.id);
  const done = list.filter((c) => store.isDone(today, c.id, k.id)).length;
  const earnedToday = list.filter((c) => store.isDone(today, c.id, k.id)).reduce((s, c) => s + c.coins, 0);
  const now = dayPart();
  const pct = list.length ? Math.round((done / list.length) * 100) : 100;

  const groups = PARTS.map(([part, label]) => {
    const items = list.filter((c) => (c.part || 'morning') === part);
    if (!items.length) return '';
    return `
      <div class="part ${part === now ? 'now' : ''}">
        <div class="part-l">${label}${part === now ? '<span class="now-tag">now</span>' : ''}</div>
        <div class="tiles">${items.map((c) => tile(k, c, store.isDone(today, c.id, k.id))).join('')}</div>
      </div>`;
  }).join('');

  const pending = store.pendingFor(k.id).filter((p) => p.type === 'bonus');
  const bonus = cfg.chores.bonus.map((b) => {
    const waiting = pending.filter((p) => p.ref === b.id).length;
    return `<button class="tile bonus" data-bonus="${b.id}" data-kid="${k.id}" style="--c:${k.color}">
      <span class="t-icon">${esc(b.icon)}</span><span class="t-title">${esc(b.title)}</span>
      <span class="t-coins">+${b.coins}</span>${waiting ? `<span class="t-wait">⏳ ${waiting} waiting</span>` : ''}</button>`;
  }).join('');

  return card(`
    <div class="kid-head" style="--c:${k.color}">
      ${avatar(k, 'lg')}
      <div><div class="kid-name">${esc(k.name)}</div><div class="kid-school">${done} of ${list.length} done · 🪙 ${earnedToday} today</div></div>
      <div class="kid-bal"><span>🪙</span>${store.balance(k.id)}</div>
    </div>
    <div class="bar big" style="--c:${k.color}"><span style="width:${pct}%"></span></div>
    ${pct === 100 && list.length ? `<div class="all-done" style="--c:${k.color}">🎉 All done today, ${esc(k.name)}!</div>` : ''}
    ${groups || empty('No chores today.')}
    ${header('Earn extra coins', { color: 'var(--coin)' })}
    <p class="muted">Did something extra? Tap it — a parent will check and send your coins.</p>
    <div class="tiles ${solo ? '' : 'compact'}">${bonus}</div>
  `, 'kid-card');
}

function tile(k, c, done) {
  return `<button class="tile ${done ? 'done' : ''}" data-chore="${c.id}" data-kid="${k.id}" style="--c:${k.color}" aria-pressed="${done}">
    <span class="t-check">${done ? '✓' : ''}</span>
    <span class="t-icon">${esc(c.icon)}</span>
    <span class="t-title">${esc(c.title)}</span>
    <span class="t-coins">+${c.coins}</span>
  </button>`;
}

export function mount(root, rerender) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chore]');
    if (t) {
      const k = kidById(t.dataset.kid);
      const chore = cfg.chores.chores.find((c) => c.id === t.dataset.chore);
      const nowDone = store.toggleChore(chore, k.id);
      if (nowDone) {
        const r = t.getBoundingClientRect();
        coinBurst(r.left + r.width / 2, r.top, chore.coins);
      }
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
