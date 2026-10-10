// Kindness Coins — each girl's two jars (Dad's and Mom's), the approval queue, the reward shop, and
// the ledger. Coins earned at a house are spent at that house, and only that house's parent OKs its
// extras and rewards. Adjusting coins lives in Parent management (#/admin).

import { cfg, kids, kid as kidById, houses } from '../data.js';
import { store, houseOf } from '../store.js';
import { card, hero, header, avatar, empty, modal, toast, requireParent, pickHouse, parentNow, jars, houseTag } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

export const title = 'Coins';

export function render() {
  const ks = kids();
  const pending = store.allPending();
  const ranked = [...ks].sort((a, b) => store.balance(b.id) - store.balance(a.id));
  const cheapest = Math.min(...cfg.chores.rewards.map((r) => r.cost));

  return `
  ${hero('Earn · save · spend', 'Kindness', 'Coins', 'Every girl has a jar at Dad’s and a jar at Mom’s. Coins earned at a house are spent at that house, and that house’s parent OKs every spend.')}

  <div class="purses">
    ${ranked.map((k, i) => {
      const bal = store.balance(k.id);
      const best = Math.max(...houses().map((h) => store.balance(k.id, h.id)));
      const week = store.earnedByDay(k.id, 7);
      const max = Math.max(1, ...week.map((d) => d.sum));
      const nextReward = cfg.chores.rewards.filter((r) => r.cost > best).sort((a, b) => a.cost - b.cost)[0];
      return `
      <div class="purse anim-card" style="--c:${esc(k.color)};--i:${i}">
        ${i === 0 && bal > 0 ? '<span class="crown">👑</span>' : ''}
        ${avatar(k, 'xl')}
        <div class="purse-name">${esc(k.name)}</div>
        ${jars(k, { big: true })}
        <div class="spark">${week.map((d, j) => `<span style="--h:${Math.max(6, (d.sum / max) * 100)}%;--i:${j}" title="${d.date}: ${d.sum}"></span>`).join('')}</div>
        <div class="purse-sub">+${week.reduce((s, d) => s + d.sum, 0)} this week${nextReward ? ` · ${nextReward.cost - best} to “${esc(nextReward.title)}”` : best >= cheapest ? ' · can pick any reward!' : ''}</div>
      </div>`;
    }).join('')}
  </div>

  ${pending.length ? card(`
    ${header('Waiting for a parent', { color: 'var(--amber)', badge: pending.length, eyebrow: 'Tap ✓ to approve · each house’s parent OKs their own' })}
    ${pending.map((p, j) => {
      const k = kidById(p.kid);
      return `<div class="pend anim-row" style="--c:${esc(k.color)};--i:${j}">
        <span class="pend-i">${esc(p.icon)}</span>
        <span class="pend-main"><span class="pend-t">${esc(k.name)} · ${esc(p.title)}</span><span class="pend-s">${houseTag(houseOf(p))} ${p.type === 'reward' ? 'wants to spend' : 'earned'} ${Math.abs(p.amount)} coins · ${relDay(new Date(p.ts))} ${clock(new Date(p.ts))}</span></span>
        <span class="pend-amt ${p.amount < 0 ? 'neg' : ''}">${p.amount > 0 ? '+' : ''}${p.amount}</span>
        <button class="btn ok" data-approve="${p.id}" aria-label="Approve">✓</button><button class="btn ghost" data-decline="${p.id}" aria-label="Decline">✕</button>
      </div>`;
    }).join('')}`, 'pend-card', 1) : ''}

  ${card(`
    ${header('Reward Shop', { color: 'var(--coin)', eyebrow: 'Pick a reward, then who it’s for and which jar pays' })}
    <div class="shop">${cfg.chores.rewards.map((r, j) => {
      const canAny = ks.some((k) => houses().some((h) => store.balance(k.id, h.id) >= r.cost));
      return `<button class="reward ${canAny ? 'can' : ''} anim-row" data-reward="${r.id}" style="--i:${j}">
        <span class="r-icon">${esc(r.icon)}</span><span class="r-title">${esc(r.title)}</span><span class="r-cost">🪙 ${r.cost}</span>
      </button>`;
    }).join('')}</div>`, 'shop-card', 2)}

  ${card(`${header('History', { color: 'var(--t3)', eyebrow: 'Every coin, explained' })}${history()}`, '', 3)}`;
}

function history() {
  const rows = store.history(null, 25);
  if (!rows.length) return empty('No coins yet — go tick off a chore!');
  const mine = parentNow();
  return rows.map((e, j) => {
    const k = kidById(e.kid);
    return `<div class="hist anim-row" style="--c:${esc(k?.color)};--i:${Math.min(j, 12)}">
      <span class="hist-i">${esc(e.icon || '🪙')}</span>
      <span class="hist-main"><span class="hist-t">${esc(e.reason)}</span><span class="hist-s"><span class="dot"></span>${esc(k?.name || e.kid)} · ${houseTag(houseOf(e))} · ${relDay(new Date(e.ts))}</span></span>
      <span class="hist-amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
      ${mine && mine === houseOf(e) ? `<button class="icon-btn sm" data-remove="${e.id}" aria-label="Remove">✕</button>` : ''}
    </div>`;
  }).join('');
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (d.reward) return pickKidForReward(cfg.chores.rewards.find((r) => r.id === d.reward), rerender);

    const id = d.approve || d.decline;
    if (id) {
      const p = store.allPending().find((x) => x.id === id);
      if (!p || !(await requireParent(houseOf(p)))) return;
      try {
        if (d.approve) { store.approve(id); toast('✓ Approved', 'var(--acc)'); }
        else store.decline(id);
      } catch (err) {
        toast(esc(err.message), 'var(--red)');
      }
      return rerender();
    }
    if (d.remove) {
      const e = store.history(null, 1e6).find((x) => x.id === d.remove);
      if (e && (await requireParent(houseOf(e)))) store.removeEntry(d.remove);
      rerender();
    }
  });
}

function pickKidForReward(r, rerender) {
  const ks = kids();
  const best = (k) => Math.max(...houses().map((h) => store.balance(k.id, h.id)));
  modal(`
    <div class="sheet-icon">${esc(r.icon)}</div>
    <div class="eyebrow">Costs 🪙 ${r.cost}</div>
    <h3 class="sheet-title">${esc(r.title)}</h3>
    <p class="sheet-sub">Who’s it for?</p>
    <div class="who-pick">${ks.map((k) => {
      const can = best(k) >= r.cost;
      return `<button class="who-btn ${can ? '' : 'disabled'}" data-for="${k.id}" style="--c:${esc(k.color)}" ${can ? '' : 'disabled'}>${avatar(k, 'lg')}<b>${esc(k.name)}</b><small>${can ? 'has enough' : `needs ${r.cost - best(k)} more`}</small></button>`;
    }).join('')}</div>
    <button class="btn ghost wide" data-close>Never mind</button>`, {
    onMount(sheet, close) {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-for]'); if (!b) return;
        const k = kidById(b.dataset.for);
        close();
        const at = await pickHouse(k, { title: 'Which jar pays?', sub: `“${esc(r.title)}” costs 🪙 ${r.cost}. That house’s parent OKs it.`, need: r.cost });
        if (!at) return;
        store.request(k.id, 'reward', r, at);
        toast(`${esc(r.icon)} Asked a parent for “${esc(r.title)}”`, k.color);
        rerender();
      });
    },
  });
}
