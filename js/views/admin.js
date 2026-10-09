// Parent Admin — the back door. Not in the nav; bookmark …/Ervin-Central/admin/ on a parent's
// phone. Everything here needs the parent passcode.
//
//   · Spent offline — record coins the girls spent in real life, with a reason
//   · Zero out      — bring a balance to 0 (history kept)
//   · Wipe          — erase a girl's history entirely
//   · Cloud         — sync status for the Supabase log, sync now, rebuild from the cloud
//   · Backup

import { cfg, kids } from '../data.js';
import { store } from '../store.js';
import { card, hero, header, avatar, toast, isParent, requireParent, lockParent, confirmSheet, empty } from '../ui.js';
import { esc, relDay, clock } from '../util.js';

export const title = 'Admin';

export function render() {
  if (!isParent()) {
    return hero('Parents only', 'Parent', 'admin') + card(`
      <div class="locked">
        <div class="sheet-icon">🔒</div>
        <h3 class="sheet-title">Parents only</h3>
        <p class="sheet-sub">Enter the parent passcode to manage ${esc(cfg.chores.coinName)}.</p>
        <button class="btn ok" data-unlock>Unlock</button>
      </div>`);
  }
  return `
  ${hero('Parents only', 'Parent', 'admin', 'Record coins spent offline, zero out or wipe a balance, and check cloud sync.')}
  <div class="stack">
    <div class="cols two">${kids().map(kidAdmin).join('')}</div>
    <div class="cols two">
      ${syncCard()}
      ${card(`
        ${header('Backup', { color: 'var(--t3)' })}
        <div class="tool-row">
          <button class="btn" data-export>⬇︎ Back up</button>
          <button class="btn" data-import>⬆︎ Restore</button>
          <button class="btn ghost" data-lock>🔒 Lock</button>
        </div>
        <p class="muted small">Restore merges by entry, so it never double-counts coins.</p>`)}
    </div>
  </div>`;
}

function kidAdmin(k) {
  const bal = store.balance(k.id);
  const recent = store.history(k.id, 6);
  return card(`
    <div class="kid-banner">${avatar(k, 'lg')}
      <div><div class="eyebrow" style="color:${esc(k.color)}">${store.pendingFor(k.id).length} waiting · ${store.history(k.id, 1e6).length} entries</div><div class="kid-name">${esc(k.name)}</div></div>
      <div class="col-bal"><span class="cb-l">Balance</span><span class="cb-v">🪙 <b>${bal}</b></span></div>
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
      <button class="btn" data-zero="${k.id}" ${bal === 0 ? 'disabled' : ''}>🧹 Zero out coins</button>
      <button class="btn danger" data-wipe="${k.id}">🗑 Wipe all history</button>
    </div>
    <p class="muted small">Zero out keeps the history and adds one “cashed in” line. Wipe erases everything for ${esc(k.name)}.</p>

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
    if (!isParent()) { if (!(await requireParent())) return; }

    if (d.quick) { t.closest('form').amount.value = d.quick; return; }

    if (d.zero) {
      const k = kids().find((x) => x.id === d.zero);
      if (await confirmSheet(`Zero out ${k.name}?`, `Takes her from 🪙 ${store.balance(k.id)} to 0. History stays.`, { ok: 'Zero out', icon: '🧹' })) {
        store.zero(k.id); toast(`🧹 ${esc(k.name)} is at 0`, k.color);
      }
    }
    if (d.wipe) {
      const k = kids().find((x) => x.id === d.wipe);
      if (await confirmSheet(`Wipe ${k.name}’s history?`, `Erases every coin, request and check-off for ${esc(k.name)} on every device. This can’t be undone — back up first if unsure.`, { ok: 'Wipe everything', danger: true, icon: '🗑' })) {
        store.wipe(k.id); toast(`Wiped ${esc(k.name)}`, 'var(--red)');
      }
    }
    if (d.remove) store.removeEntry(d.remove);
    if ('lock' in d) { lockParent(); location.hash = '#/home'; return; }
    if ('export' in d) exportBackup();
    if ('import' in d) return importBackup(rerender);
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
    if (!(await requireParent())) return;

    if (f.dataset.spend) {
      const k = kids().find((x) => x.id === f.dataset.spend);
      const amt = Math.abs(parseInt(f.amount.value, 10));
      if (!amt) return;
      store.spend(k.id, amt, f.reason.value.trim() || 'Spent offline');
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
