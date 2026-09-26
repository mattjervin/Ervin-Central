// Kindness Coins — balances, the reward shop, the parent approval queue, and the ledger.
// Anything that moves coins without a chore behind it (approvals, adjustments, backups)
// asks for the parent PIN first.

import { cfg, kids, kid as kidById } from '../data.js';
import { store } from '../store.js';
import { card, header, avatar, empty, modal, toast, requireParent, isParent, lockParent } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

export const title = ['Kindness', 'Coins'];

export function render() {
  const ks = kids();
  const pending = store.allPending();
  return `
  <div class="stack">
    <div class="balances">
      ${ks.map((k) => {
        const week = store.earnedByDay(k.id, 7);
        const max = Math.max(1, ...week.map((d) => d.sum));
        return `
        <div class="bal-card" style="--c:${k.color}">
          ${avatar(k, 'xl')}
          <div class="bal-name">${esc(k.name)}</div>
          <div class="bal-val"><span class="coin-glyph">🪙</span>${store.balance(k.id)}</div>
          <div class="spark" title="Coins earned, last 7 days">${week.map((d) => `<span style="height:${Math.max(6, (d.sum / max) * 100)}%" title="${d.date}: ${d.sum}"></span>`).join('')}</div>
          <div class="bal-sub">earned this week: ${week.reduce((s, d) => s + d.sum, 0)}</div>
        </div>`;
      }).join('')}
    </div>

    ${pending.length ? card(`
      ${header('Waiting for a parent', { color: 'var(--amber)', badge: pending.length })}
      <ul class="rows">${pending.map((p) => {
        const k = kidById(p.kid);
        return `<li class="row pend">
          <span class="row-icon">${esc(p.icon)}</span>
          <span class="row-main"><span class="row-title">${esc(k.name)} · ${esc(p.title)}</span><span class="row-sub">${p.type === 'reward' ? 'wants to spend' : 'earned'} ${Math.abs(p.amount)} coins · ${relDay(new Date(p.ts))} ${clock(new Date(p.ts))}</span></span>
          <span class="row-actions"><button class="btn ok" data-approve="${p.id}">✓ OK</button><button class="btn ghost" data-decline="${p.id}">✕</button></span>
        </li>`;
      }).join('')}</ul>`, 'pend-card') : ''}

    ${card(`
      ${header('Reward Shop', { color: 'var(--coin)' })}
      <p class="muted">Pick a reward and who it’s for. A parent will OK it and the coins come off.</p>
      <div class="tiles">${cfg.chores.rewards.map((r) => `
        <button class="tile reward" data-reward="${r.id}">
          <span class="t-icon">${esc(r.icon)}</span><span class="t-title">${esc(r.title)}</span><span class="t-coins cost">🪙 ${r.cost}</span>
        </button>`).join('')}</div>`)}

    <div class="grid two">
      ${card(`${header('Recent', { color: 'var(--t3)' })}${history()}`)}
      ${card(`
        ${header('Parent tools', { color: 'var(--red)' })}
        <div class="tools">
          ${ks.map((k) => `<div class="tool-row" style="--c:${k.color}">${avatar(k)}<span>${esc(k.name)}</span>
            <button class="btn" data-adj="${k.id}" data-amt="-1">−1</button>
            <button class="btn" data-adj="${k.id}" data-amt="1">+1</button>
            <button class="btn" data-adj="${k.id}" data-amt="5">+5</button></div>`).join('')}
          <div class="tool-row"><a class="btn ghost" href="#/admin">⚙︎ Admin — spent offline, zero out, sync</a>
          ${isParent() ? '<button class="btn ghost" data-lock>🔒 Lock</button>' : ''}</div>
        </div>`)}
    </div>
  </div>`;
}

function history() {
  const rows = store.history(null, 25);
  if (!rows.length) return empty('No coins yet — go tick off a chore!');
  return `<ul class="rows ledger">${rows.map((e) => {
    const k = kidById(e.kid);
    return `<li class="row">
      <span class="row-icon">${esc(e.icon || '🪙')}</span>
      <span class="row-main"><span class="row-title">${esc(e.reason)}</span><span class="row-sub"><span class="dot" style="--c:${k?.color}"></span> ${esc(k?.name || e.kid)} · ${relDay(new Date(e.ts))}</span></span>
      <span class="amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
      ${isParent() ? `<button class="btn icon ghost" data-remove="${e.id}" aria-label="Remove">✕</button>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (d.reward) return pickKidForReward(cfg.chores.rewards.find((r) => r.id === d.reward), rerender);

    // Everything below is parent-only.
    const parentAction = d.approve || d.decline || d.adj || d.remove;
    if ('lock' in d) { lockParent(); return rerender(); }
    if (!parentAction || !(await requireParent())) return;

    try {
      if (d.approve) { store.approve(d.approve); toast('✓ Approved', 'var(--good)'); }
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
    <h3 class="sheet-title">${esc(r.title)}</h3>
    <p class="sheet-sub">Costs 🪙 ${r.cost}. Who’s it for?</p>
    <div class="who-pick">${ks.map((k) => {
      const can = store.balance(k.id) >= r.cost;
      return `<button class="kp-btn ${can ? '' : 'disabled'}" data-for="${k.id}" style="--c:${k.color}" ${can ? '' : 'disabled'}>${avatar(k)}${esc(k.name)}<small>${can ? `has ${store.balance(k.id)}` : `needs ${r.cost - store.balance(k.id)} more`}</small></button>`;
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
