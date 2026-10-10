// Parent management — the button at the bottom of every page (or …/Ervin-Central/admin/). Dad's code
// opens Dad's area, Mom's code opens Mom's; each parent manages their own house's jars:
//
//   · Waiting for you — extras and rewards asked of this house
//   · Per girl        — this house's jar: quick ±, a kindness catch, coins spent offline, zero out,
//                       recent history
//   · Site tools      — sync status, backup/restore and wipe, for passcodes.siteTools only

import { cfg, kids, house, choreById } from '../data.js';
import { store, houseOf } from '../store.js';
import { card, hero, header, avatar, toast, parentNow, hasSiteTools, requireParent, lockParent, confirmSheet, empty, houseTag } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

export const title = 'Parent management';

export function render() {
  const me = parentNow();
  if (!me) {
    return hero('Parents only', 'Parent', 'management') + card(`
      <div class="locked">
        <div class="sheet-icon">🔒</div>
        <h3 class="sheet-title">Parents only</h3>
        <p class="sheet-sub">Enter your parent code. Each code opens that parent’s house: its ${esc(cfg.chores.coinName)}, approvals and history.</p>
        <button class="btn ok" data-unlock>Enter code</button>
      </div>`);
  }
  const h = house(me);
  const pending = store.allPending(me);
  return `
  ${hero(`Parent management · ${h.label}`, h.label.replace(/’s$|'s$/, '’s'), 'jars', `You’re managing the coins in ${esc(h.label)} jars. Locks itself after 5 minutes.`)}
  <div class="stack" style="--h:${esc(h.color)}">
    ${pending.length ? card(`
      ${header('Waiting for you', { color: 'var(--amber)', badge: pending.length })}
      ${pending.map((p, j) => {
        const k = kids().find((x) => x.id === p.kid);
        return `<div class="pend anim-row" style="--c:${esc(k.color)};--i:${j}">
          <span class="pend-i">${esc(p.icon)}</span>
          <span class="pend-main"><span class="pend-t">${esc(k.name)} · ${esc(p.title)}</span><span class="pend-s">${p.type === 'reward' ? 'wants to spend' : 'earned'} ${Math.abs(p.amount)} coins · ${relDay(new Date(p.ts))} ${clock(new Date(p.ts))}</span></span>
          <span class="pend-amt ${p.amount < 0 ? 'neg' : ''}">${p.amount > 0 ? '+' : ''}${p.amount}</span>
          <button class="btn ok" data-approve="${p.id}" aria-label="Approve">✓</button><button class="btn ghost" data-decline="${p.id}" aria-label="Decline">✕</button>
        </div>`;
      }).join('')}`, 'pend-card') : ''}
    <div class="cols two">${kids().map((k) => kidAdmin(k, me)).join('')}</div>
    ${hasSiteTools() ? `<div class="cols two">
      ${syncCard()}
      ${card(`
        ${header('Backup', { color: 'var(--t3)' })}
        <div class="tool-row">
          <button class="btn" data-export>⬇︎ Back up</button>
          <button class="btn" data-import>⬆︎ Restore</button>
        </div>
        <p class="muted small">Restore merges by entry, so it never double-counts coins.</p>`)}
    </div>` : ''}
    <div class="tool-row"><button class="btn ghost" data-lock>🔒 Lock</button></div>
  </div>`;
}

function kidAdmin(k, me) {
  const h = house(me);
  const bal = store.balance(k.id, me);
  const recent = store.history(k.id, 6, me);
  const kind = (cfg.chores.extra || []).filter((x) => x.parentOnly);
  return card(`
    <div class="kid-banner">${avatar(k, 'lg')}
      <div><div class="eyebrow" style="color:${esc(k.color)}">${houseTag(me)} jar</div><div class="kid-name">${esc(k.name)}</div></div>
      <div class="col-bal"><span class="cb-l">Balance</span><span class="cb-v">🪙 <b>${bal}</b></span></div>
    </div>

    ${header('Quick', { color: 'var(--acc)' })}
    <div class="tool-row">
      <button class="btn" data-adj="${k.id}" data-amt="-1">−1</button>
      <button class="btn" data-adj="${k.id}" data-amt="1">+1</button>
      <button class="btn" data-adj="${k.id}" data-amt="5">+5</button>
      ${kind.map((x) => {
        const given = store.extraState(k.id, x.id) === 'done';
        return `<button class="btn ok" data-award="${x.id}" data-kid="${k.id}" ${given ? 'disabled' : ''}>${esc(x.icon)} ${esc(x.title)} +${x.coins}${given ? ' · given today' : ''}</button>`;
      }).join('')}
    </div>

    ${header('Spent offline', { color: 'var(--coin)' })}
    <form class="spend" data-spend="${k.id}">
      <div class="quick">${[5, 10, 20, 50].map((n) => `<button type="button" class="choice-pill" data-quick="${n}">${n}</button>`).join('')}
        <button type="button" class="choice-pill" data-quick="${bal}">All ${bal}</button></div>
      <div class="field-row">
        <input name="amount" type="number" inputmode="numeric" min="1" placeholder="Coins" required>
        <input name="reason" type="text" placeholder="What for? (Target trip…)" maxlength="60">
        <button class="btn ok" type="submit">Record</button>
      </div>
    </form>

    ${header('Reset', { color: 'var(--red)' })}
    <div class="tool-row">
      <button class="btn" data-zero="${k.id}" ${bal === 0 ? 'disabled' : ''}>🧹 Zero out ${esc(h.label)} jar</button>
      ${hasSiteTools() ? `<button class="btn danger" data-wipe="${k.id}">🗑 Wipe all history</button>` : ''}
    </div>
    <p class="muted small">Zero out empties only ${esc(h.label)} jar and keeps the history.${hasSiteTools() ? ` Wipe erases everything for ${esc(k.name)}, both houses.` : ''}</p>

    ${header('Recent', { color: 'var(--t4)' })}
    ${recent.length ? `<ul class="rows ledger">${recent.map((e) => `
      <li class="row"><span class="row-icon">${esc(e.icon || '🪙')}</span>
        <span class="row-main"><span class="row-title">${esc(e.reason)}</span><span class="row-sub">${relDay(new Date(e.ts))} ${clock(new Date(e.ts))}</span></span>
        <span class="amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
        <button class="btn icon ghost" data-remove="${e.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>` : empty('Nothing yet.')}
  `, 'kid-card', 0, `--c:${esc(k.color)}`);
}

function syncCard() {
  const s = store.status;
  if (s.mode !== 'cloud') {
    return card(`
      ${header('Sync · this device only', { color: 'var(--amber)' })}
      <p class="muted">No cloud settings in data/family.json → sync, so coins are saved on this device only.</p>`);
  }
  const state = s.error ? `<span class="sync-state err">⚠︎ ${esc(s.error)}</span>`
    : s.pending ? `<span class="sync-state warn">Saving ${s.pending}…</span>`
    : `<span class="sync-state ok">✓ Synced${s.lastSync ? ' ' + clock(new Date(s.lastSync)) : ''}</span>`;
  return card(`
    ${header('Sync · Supabase cloud', { color: 'var(--blue)' })}
    <p class="muted">${state}</p>
    <ul class="bin-list">
      <li><span>Project</span><code>${esc(new URL(store.sync.url).hostname.split('.')[0])}</code></li>
      <li><span>Table</span><code>${esc(store.sync.schema)}.ops</code></li>
      <li><span>Log position</span><code>#${esc(s.lastSeq)}</code></li>
      <li><span>This device</span><code>${esc(s.device)}</code></li>
    </ul>
    <div class="tool-row">
      <button class="btn" data-sync-now>↻ Sync now</button>
      <button class="btn ghost" data-resync>Rebuild from cloud</button>
    </div>
    <p class="muted small">Every device reads and writes the same cloud log, so there’s nothing to set up per device. The log keeps every change, even after a wipe.</p>`);
}

export function mount(root, rerender) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if ('unlock' in d) { if (await requireParent()) rerender(); return; }
    const me = parentNow() || (await requireParent());
    if (!me) return;
    const kidOf = (id) => kids().find((x) => x.id === id);

    if (d.quick) { t.closest('form').amount.value = d.quick; return; }

    if (d.approve || d.decline) {
      const p = store.allPending(me).find((x) => x.id === (d.approve || d.decline));
      if (!p) return rerender();
      try {
        if (d.approve) { store.approve(p.id); toast('✓ Approved', 'var(--acc)'); }
        else store.decline(p.id);
      } catch (err) { toast(esc(err.message), 'var(--red)'); }
    }
    if (d.adj) store.adjust(d.adj, Number(d.amt), Number(d.amt) > 0 ? `Bonus from ${house(me).label.replace(/’s$|'s$/, '')}` : 'Adjustment', me);
    if (d.award) {
      const k = kidOf(d.kid);
      const x = choreById(d.award);
      store.award(k.id, x, me);
      toast(`${esc(x.icon)} ${esc(k.name)} +${x.coins}`, k.color);
    }
    if (d.zero) {
      const k = kidOf(d.zero);
      const h = house(me);
      if (await confirmSheet(`Zero out ${k.name}’s ${h.label} jar?`, `Takes it from 🪙 ${store.balance(k.id, me)} to 0. History stays. The other house’s jar isn’t touched.`, { ok: 'Zero out', icon: '🧹' })) {
        store.zero(k.id, me); toast(`🧹 ${esc(k.name)}’s ${esc(h.label)} jar is at 0`, k.color);
      }
    }
    if (d.wipe && hasSiteTools()) {
      const k = kidOf(d.wipe);
      if (await confirmSheet(`Wipe ${k.name}’s history?`, `Erases every coin, request and check-off for ${esc(k.name)} at both houses, on every device. This can’t be undone — back up first if unsure.`, { ok: 'Wipe everything', danger: true, icon: '🗑' })) {
        store.wipe(k.id); toast(`Wiped ${esc(k.name)}`, 'var(--red)');
      }
    }
    if (d.remove) {
      const entry = store.history(null, 1e6).find((x) => x.id === d.remove);
      if (entry && houseOf(entry) === me) store.removeEntry(d.remove);
    }
    if ('lock' in d) { lockParent(); location.hash = '#/home'; return; }
    if ('export' in d && hasSiteTools()) exportBackup();
    if ('import' in d && hasSiteTools()) return importBackup(rerender);
    if ('syncNow' in d) { await store.pull(); toast(store.status.error ? esc(store.status.error) : '✓ Synced', store.status.error ? 'var(--red)' : 'var(--good)'); }
    if ('resync' in d) {
      if (await confirmSheet('Rebuild from the cloud?', 'Throws away this device’s copy and replays every change from the cloud log. Nothing in the cloud changes.', { ok: 'Rebuild', icon: '☁️' })) {
        await store.resync(); toast(store.status.error ? esc(store.status.error) : '✓ Rebuilt from the cloud', store.status.error ? 'var(--red)' : 'var(--good)');
      }
    }
    rerender();
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const me = parentNow() || (await requireParent());
    if (!me) return;

    if (f.dataset.spend) {
      const k = kids().find((x) => x.id === f.dataset.spend);
      const amt = Math.abs(parseInt(f.amount.value, 10));
      if (!amt) return;
      store.spend(k.id, amt, f.reason.value.trim() || 'Spent offline', me);
      toast(`🛍️ ${esc(k.name)} spent ${amt}`, k.color);
      rerender();
    }
  });
}

function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ervin-central-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup(rerender) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    try { store.importJson(await input.files[0].text()); toast('Restored', 'var(--good)'); rerender(); }
    catch (err) { toast(esc(err.message), 'var(--red)'); }
  };
  input.click();
}
