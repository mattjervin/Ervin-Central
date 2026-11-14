// Kindness Coins — the coin half of the Chores page (there's no separate Coins page any more): the
// approval queue, the reward shop and Total Coins (each girl's Dad's and Mom's jars). The ledger
// (historyCard) shows in Parent management — it's a parent's check, not a kid's screen. Coins are earned per house but spent from both jars together; the house picked on a reward is just which parent OKs it, and only that parent OKs its
// extras and rewards. Adjusting coins lives in Parent management (#/admin).

import { cfg, kids, kid as kidById, houses, choreKids } from '../data.js';
import { store, houseOf } from '../store.js';
import { card, hero, header, avatar, coin, empty, modal, toast, requireParent, pickHouse, parentNow, houseTag, jars } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

const bestJar = (k) => store.balance(k.id); // spending is combined across both houses

/** Each girl's coins — her two jars and what she's saving toward. Fixed order, no ranks: it's a total,
 *  not a race. */
export function totalCoinsCard(i, { fold = false } = {}) {
  const eyebrow = [cfg.chores.coinName, cfg.chores.coinValue].filter(Boolean).join(' · ');
  const body = `
    ${fold ? '' : header('Total Coins', { color: 'var(--coin)', eyebrow })}
    ${choreKids().map((k, r) => {
      const b = store.balance(k.id);
      const week = store.earnedByDay(k.id, 7).reduce((s, d) => s + d.sum, 0);
      const best = bestJar(k);
      const next = cfg.chores.rewards.filter((x) => x.cost > best).sort((x, y) => x.cost - y.cost)[0];
      return `<a class="lb-row anim-row" href="#/chores/${k.id}" style="--c:${esc(k.color)};--i:${r}">
        ${avatar(k)}
        <div class="lb-main"><div class="lb-name">${esc(k.name)}<span>+${week} this week</span></div>
          ${jars(k)}
          ${next ? `<div class="lb-next">${next.cost - best} more to ${esc(next.icon)} ${esc(next.title)}</div>` : ''}</div>
        <span class="lb-val">${coin()} <b data-count="${b}">${b}</b></span></a>`;
    }).join('')}`;
  return fold ? foldCard('total', '🏆', 'Total Coins', eyebrow, body, i) : card(body, 'leader-card', i);
}

/** Extras and rewards waiting on a parent; each house's parent OKs their own. */
export function waitingCard(i) {
  const pending = store.allPending();
  if (!pending.length) return '';
  return card(`
    ${header('Waiting for a parent', { color: 'var(--amber)', badge: pending.length, eyebrow: 'Tap ✓ to approve · each house’s parent OKs their own' })}
    ${pending.map((p, j) => {
      const k = kidById(p.kid);
      return `<div class="pend anim-row" style="--c:${esc(k.color)};--i:${j}">
        <span class="pend-i">${esc(p.icon)}</span>
        <span class="pend-main"><span class="pend-t">${esc(k.name)} · ${esc(p.title)}</span><span class="pend-s">${houseTag(houseOf(p))} ${p.type === 'reward' ? 'wants to spend' : 'earned'} ${Math.abs(p.amount)} coins · ${relDay(new Date(p.ts))} ${clock(new Date(p.ts))}</span></span>
        <span class="pend-amt ${p.amount < 0 ? 'neg' : ''}">${p.amount > 0 ? '+' : ''}${p.amount}</span>
        <button class="btn ok" data-approve="${p.id}" aria-label="Approve">✓</button><button class="btn ghost" data-decline="${p.id}" aria-label="Decline">✕</button>
      </div>`;
    }).join('')}`, 'pend-card', i);
}

/** The shop gets a page-sized title (same as "Chore chart") so it's obvious where coins get spent. */
export function shopCard(i, { fold = false, kid = null } = {}) {
  // With a girl picked, the shop is hers: what she can't afford yet is greyed out and can't be tapped.
  const ks = kid ? [kid] : kids();
  const have = (k) => store.available(k.id); // both jars together, minus rewards already waiting
  const sub = kid ? `${kid.name} has ${have(kid)} coins` : 'Spend your coins';
  const body = `
    <div class="shop">${cfg.chores.rewards.map((r, j) => {
      const can = ks.some((k) => have(k) >= r.cost);
      const short = kid ? r.cost - have(kid) : 0;
      return `<button class="reward ${can ? 'can' : ''} ${kid && !can ? 'locked' : ''} anim-row" data-reward="${r.id}" ${kid ? `data-kid="${esc(kid.id)}"` : ''} ${kid && !can ? 'disabled aria-disabled="true"' : ''} style="--i:${j}">
        <span class="r-icon">${esc(r.icon)}</span><span class="r-title">${esc(r.title)}${kid && !can ? `<small>needs ${short} more</small>` : ''}</span><span class="r-cost">${coin()} ${r.cost}</span>
      </button>`;
    }).join('')}</div>`;
  return fold ? foldCard('shop', '🎁', 'Reward shop', sub, body, i) : hero('', 'Reward', 'shop') + card(body, 'shop-card', i);
}

// Which big buttons on the Chores page are open, and whether the activity list shows all of it. Kept
// here (not in the DOM) because a tick redraws the page.
const open = new Set();
let showAll = false;

/** A big button with a down arrow that opens a card's worth of content beneath it. */
export function foldCard(id, icon, label, sub, body, i) {
  return `<details class="fold anim-fade-up" data-fold="${id}" ${open.has(id) ? 'open' : ''} style="--i:${i}">
    <summary><span class="fold-i">${icon}</span><span class="fold-t">${esc(label)}<small>${esc(sub)}</small></span><span class="fold-arrow" aria-hidden="true">⌄</span></summary>
    <div class="fold-body">${body}</div>
  </details>`;
}

/**
 * The coin ledger. On Parent management: everyone, ✕ on your own house's lines. On the Chores page: just
 * the picked girl, read-only — so she can see how she got every coin, including a parent's note.
 */
export function historyCard(i, { kid = null, title = 'History', eyebrow = 'Every coin, both houses · ✕ removes a line from your own jar', limit = 25, removable = true, fold = false, first = 6 } = {}) {
  if (!fold) return card(`${header(title, { color: 'var(--t3)', eyebrow })}${history({ kid, limit, removable })}`, 'hist-card', i);
  const total = store.history(kid, limit).length;
  const more = total > first;
  const body = `${history({ kid, limit: showAll ? limit : first, removable })}
    ${more ? `<button class="btn ghost more-btn" data-more>${showAll ? 'Show fewer' : `Show more (${total - first})`}</button>` : ''}`;
  return foldCard('hist', '🪙', title, eyebrow, body, i);
}

/** Clicks and toggles for the folded cards. Returns true when the click was the "show more" button. */
export function foldEvents(root, rerender) {
  root.addEventListener('toggle', (e) => {
    const d = e.target.closest?.('[data-fold]');
    if (d) d.open ? open.add(d.dataset.fold) : open.delete(d.dataset.fold);
  }, true);
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-more]')) return;
    showAll = !showAll;
    rerender();
  });
}

function history({ kid = null, limit = 25, removable = true } = {}) {
  const rows = store.history(kid, limit);
  if (!rows.length) return empty('No coins yet — go tick off a chore!');
  const mine = removable ? parentNow() : null;
  return rows.map((e, j) => {
    const k = kidById(e.kid);
    return `<div class="hist anim-row" style="--c:${esc(k?.color)};--i:${Math.min(j, 12)}">
      <span class="hist-i">${e.icon ? esc(e.icon) : coin()}</span>
      <span class="hist-main"><span class="hist-t">${esc(e.reason)}</span><span class="hist-s">${kid ? '' : `<span class="dot"></span>${esc(k?.name || e.kid)} · `}${houseTag(houseOf(e))} · ${relDay(new Date(e.ts))} ${clock(new Date(e.ts))}</span></span>
      <span class="hist-amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
      ${mine && mine === houseOf(e) ? `<button class="icon-btn sm" data-remove="${e.id}" aria-label="Remove">✕</button>` : ''}
    </div>`;
  }).join('');
}

/** Clicks for the coin sections. Returns true when it handled the click. */
export async function coinClick(e, rerender) {
  const t = e.target.closest('button');
  if (!t) return false;
  const d = t.dataset;
  if (!(d.reward || d.approve || d.decline)) return false;

  if (d.reward) {
    const r = cfg.chores.rewards.find((x) => x.id === d.reward);
    const k = kidById(d.kid);
    if (k && store.available(k.id) < r.cost) { toast(`${esc(k.name)} needs ${r.cost - store.available(k.id)} more coins`, 'var(--red)'); return true; }
    pickKidForReward(r, rerender, k);
    return true;
  }

  const id = d.approve || d.decline;
  if (id) {
    const p = store.allPending().find((x) => x.id === id);
    if (!p || !(await requireParent(houseOf(p)))) return true;
    try {
      if (d.approve) { store.approve(id); toast('✓ Approved', 'var(--acc)'); }
      else store.decline(id);
    } catch (err) {
      toast(esc(err.message), 'var(--red)');
    }
    rerender();
    return true;
  }
  return false;
}

function pickKidForReward(r, rerender, only = null) {
  const ks = only ? [only] : choreKids();
  const best = (k) => store.available(k.id); // both jars together, minus rewards already waiting
  modal(`
    <div class="sheet-icon">${esc(r.icon)}</div>
    <div class="eyebrow">Costs ${coin()} ${r.cost}</div>
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
        const at = await pickHouse(k, { title: 'Who’s buying?', sub: `“${esc(r.title)}” costs ${coin()} ${r.cost}, paid from both jars together. Pick the house whose parent OKs it.` });
        if (!at) return;
        try { store.request(k.id, 'reward', r, at); } catch (err) { toast(esc(err.message), 'var(--red)'); return; }
        toast(`${esc(r.icon)} Asked a parent for “${esc(r.title)}”`, k.color);
        rerender();
      });
    },
  });
}
