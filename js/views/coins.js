// Kindness Coins — balances, the parent approval queue, the reward shop, and the ledger.
// Anything that moves coins without a chore behind it asks for the parent passcode first.

import { cfg, kids, kid as kidById } from '../data.js';
import { store } from '../store.js';
import { card, hero, header, avatar, empty, modal, toast, requireParent, isParent, lockParent } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

export const title = 'Coins';

export function render() {
  const ks = kids();
  const pending = store.allPending();
  const ranked = [...ks].sort((a, b) => store.balance(b.id) - store.balance(a.id));
  const cheapest = Math.min(...cfg.chores.rewards.map((r) => r.cost));

  return `
  ${hero('Earn · save · spend', 'Kindness', 'Coins', 'Coins come from chores and kind extras. Save them up for rewards — a parent OKs every spend.')}

  <div class="purses">
    ${ranked.map((k, i) => {
      const bal = store.balance(k.id);
      const week = store.earnedByDay(k.id, 7);
      const max = Math.max(1, ...week.map((d) => d.sum));
      const nextReward = cfg.chores.rewards.filter((r) => r.cost > bal).sort((a, b) => a.cost - b.cost)[0];
      return `
      <div class="purse anim-card" style="--c:${esc(k.color)};--i:${i}">
        ${i === 0 && bal > 0 ? '<span class="crown">👑</span>' : ''}
        ${avatar(k, 'xl')}
        <div class="purse-name">${esc(k.name)}</div>
        <div class="purse-val"><span class="coin-spin">🪙</span><b data-count="${bal}">${bal}</b></div>
        <div class="spark">${week.map((d, j) => `<span style="--h:${Math.max(6, (d.sum / max) * 100)}%;--i:${j}" title="${d.date}: ${d.sum}"></span>`).join('')}</div>
        <div class="purse-sub">+${week.reduce((s, d) => s + d.sum, 0)} this week${nextReward ? ` · ${nextReward.cost - bal} to “${esc(nextReward.title)}”` : bal >= cheapest ? ' · can pick any reward!' : ''}</div>
      </div>`;
    }).join('')}
  </div>

  ${pending.length ? card(`
    ${header('Waiting for a parent', { color: 'var(--amber)', badge: pending.length, eyebrow: 'Tap ✓ to approve' })}
    ${pending.map((p, j) => {
      const k = kidById(p.kid);
      return `<div class="pend anim-row" style="--c:${esc(k.color)};--i:${j}">
        <span class="pend-i">${esc(p.icon)}</span>
        <span class="pend-main"><span class="pend-t">${esc(k.name)} · ${esc(p.title)}</span><span class="pend-s">${p.type === 'reward' ? 'wants to spend' : 'earned'} ${Math.abs(p.amount)} coins · ${relDay(new Date(p.ts))} ${clock(new Date(p.ts))}</span></span>
        <span class="pend-amt ${p.amount < 0 ? 'neg' : ''}">${p.amount > 0 ? '+' : ''}${p.amount}</span>
        <button class="btn ok" data-approve="${p.id}">✓</button><button class="btn ghost" data-decline="${p.id}">✕</button>
      </div>`;
    }).join('')}`, 'pend-card', 1) : ''}

  ${card(`
    ${header('Reward Shop', { color: 'var(--coin)', eyebrow: 'Pick a reward, then who it’s for' })}
    <div class="shop">${cfg.chores.rewards.map((r, j) => {
      const canAny = ks.some((k) => store.balance(k.id) >= r.cost);
      return `<button class="reward ${canAny ? 'can' : ''} anim-row" data-reward="${r.id}" style="--i:${j}">
        <span class="r-icon">${esc(r.icon)}</span><span class="r-title">${esc(r.title)}</span><span class="r-cost">🪙 ${r.cost}</span>
      </button>`;
    }).join('')}</div>`, 'shop-card', 2)}

  <div class="cols two">
    ${card(`${header('History', { color: 'var(--t3)', eyebrow: 'Every coin, explained' })}${history()}`, '', 3)}
    ${card(`
      ${header('Quick adjust', { color: 'var(--red)', eyebrow: 'Parents only' })}
      ${ks.map((k) => `<div class="adj-row" style="--c:${esc(k.color)}">${avatar(k)}<span>${esc(k.name)}</span>
        <button class="btn" data-adj="${k.id}" data-amt="-1">−1</button>
        <button class="btn" data-adj="${k.id}" data-amt="1">+1</button>
        <button class="btn" data-adj="${k.id}" data-amt="5">+5</button></div>`).join('')}
      <div class="adj-row"><a class="btn ghost" href="#/admin">⚙︎ Admin — spent offline, zero out, sync</a>
      ${isParent() ? '<button class="btn ghost" data-lock>🔒 Lock</button>' : ''}</div>`, '', 4)}
  </div>`;
}

function history() {
  const rows = store.history(null, 25);
  if (!rows.length) return empty('No coins yet — go tick off a chore!');
  return rows.map((e, j) => {
    const k = kidById(e.kid);
    return `<div class="hist anim-row" style="--c:${esc(k?.color)};--i:${Math.min(j, 12)}">
      <span class="hist-i">${esc(e.icon || '🪙')}</span>
      <span class="hist-main"><span class="hist-t">${esc(e.reason)}</span><span class="hist-s"><span class="dot"></span>${esc(k?.name || e.kid)} · ${relDay(new Date(e.ts))}</span></span>
      <span class="hist-amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
      ${isParent() ? `<button class="icon-btn sm" data-remove="${e.id}" aria-label="Remove">✕</button>` : ''}
    </div>`;
  }).join('');
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (d.reward) return pickKidForReward(cfg.chores.rewards.find((r) => r.id === d.reward), rerender);
    if ('lock' in d) { lockParent(); return rerender(); }

    const parentAction = d.approve || d.decline || d.adj || d.remove;
    if (!parentAction || !(await requireParent())) return;
    try {
      if (d.approve) { store.approve(d.approve); toast('✓ Approved', 'var(--acc)'); }
      if (d.decline) store.decline(d.decline);
      if (d.adj) store.adjust(d.adj, Number(d.amt));
      if (d.remove) store.removeEntry(d.remove);
    } catch (err) {
      toast(esc(err.message), 'var(--red)');
    }
    rerender();
  });
}

function pickKidForReward(r, rerender) {
  const ks = kids();
  modal(`
    <div class="sheet-icon">${esc(r.icon)}</div>
    <div class="eyebrow">Costs 🪙 ${r.cost}</div>
    <h3 class="sheet-title">${esc(r.title)}</h3>
    <p class="sheet-sub">Who’s it for?</p>
    <div class="who-pick">${ks.map((k) => {
      const can = store.balance(k.id) >= r.cost;
      return `<button class="who-btn ${can ? '' : 'disabled'}" data-for="${k.id}" style="--c:${esc(k.color)}" ${can ? '' : 'disabled'}>${avatar(k, 'lg')}<b>${esc(k.name)}</b><small>${can ? `has ${store.balance(k.id)}` : `needs ${r.cost - store.balance(k.id)} more`}</small></button>`;
    }).join('')}</div>
    <button class="btn ghost wide" data-close>Never mind</button>`, {
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-for]'); if (!b) return;
        const k = kidById(b.dataset.for);
        store.request(k.id, 'reward', r);
        close();
        toast(`${esc(r.icon)} Asked a parent for “${esc(r.title)}”`, k.color);
        rerender();
      });
    },
  });
}
