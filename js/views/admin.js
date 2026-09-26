// Parent Admin — the back door. Not in the nav; reach it from 🔓 Parent → Admin, or bookmark
// #/admin on a parent's phone. Everything here needs the PIN.
//
//   · Spent offline — record coins the girls spent in real life, with a reason
//   · Zero out      — bring a balance to 0 (history kept)
//   · Wipe          — erase a girl's history entirely
//   · Sync          — connect this device to the JSONBin bins, share a setup link
//   · PIN, backup

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
        <p class="sheet-sub">Enter the parent PIN to manage ${esc(cfg.chores.coinName)}.</p>
        <button class="btn ok" data-unlock>Unlock</button>
      </div>`);
  }
  return `
  ${hero('Parents only', 'Parent', 'admin', 'Record coins spent offline, zero out or wipe a balance, and manage sync.')}
  <div class="stack">
    <div class="cols two">${kids().map(kidAdmin).join('')}</div>
    <div class="cols two">
      ${syncCard()}
      ${card(`
        ${header('PIN & backup', { color: 'var(--t3)' })}
        <div class="tool-row">
          <button class="btn" data-pin>🔑 Change PIN</button>
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
      <div><div class="eyebrow" style="color:${k.color}">${store.pendingFor(k.id).length} waiting · ${store.history(k.id, 1e6).length} entries</div><div class="kid-name">${esc(k.name)}</div></div>
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
  `, 'kid-card', 0, `--c:${k.color}`);
}

function syncCard() {
  const s = store.status;
  const kidsList = kids();
  if (s.mode === 'jsonbin') {
    const state = s.error ? `<span class="sync-state err">⚠︎ ${esc(s.error)}</span>`
      : s.pending ? `<span class="sync-state warn">Saving ${s.pending}…</span>`
      : `<span class="sync-state ok">✓ Synced${s.lastSync ? ' ' + clock(new Date(s.lastSync)) : ''}</span>`;
    return card(`
      ${header('Sync · JSONBin', { color: 'var(--blue)' })}
      <p class="muted">${state}</p>
      <ul class="bin-list">
        ${['household', ...kidsList.map((k) => k.id)].map((b) => `<li><span>${esc(b === 'household' ? 'Household' : kidsList.find((k) => k.id === b).name)}</span><code>${esc(store.sync.bins[b])}</code></li>`).join('')}
      </ul>
      <div class="tool-row">
        <button class="btn" data-sync-now>↻ Sync now</button>
        <button class="btn" data-share>📲 Setup link for another device</button>
        <button class="btn ghost" data-disconnect>Disconnect this device</button>
      </div>
      <p class="muted small">The setup link holds the access key — share it only with family devices (AirDrop / Messages to yourself).</p>`);
  }
  return card(`
    ${header('Sync · this device only', { color: 'var(--amber)' })}
    <p class="muted">Coins are saved on this device only. Connect JSONBin so every iPad and iPhone shares them.</p>
    <form class="connect" data-connect>
      <label>Setup link or code <input name="code" type="text" placeholder="Paste a setup link…" autocomplete="off"></label>
      <details><summary class="muted">…or enter the keys by hand</summary>
        <label>Access key <input name="accessKey" type="text" autocomplete="off" spellcheck="false"></label>
        <label>Household bin id <input name="household" type="text" autocomplete="off" spellcheck="false"></label>
        ${kidsList.map((k) => `<label>${esc(k.name)} bin id <input name="${k.id}" type="text" autocomplete="off" spellcheck="false"></label>`).join('')}
      </details>
      <button class="btn ok" type="submit">Connect</button>
    </form>`);
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
    if ('pin' in d) { if (await requireParent({ reset: true })) toast('🔑 PIN changed', 'var(--good)'); }
    if ('lock' in d) { lockParent(); location.hash = '#/home'; return; }
    if ('export' in d) exportBackup();
    if ('import' in d) return importBackup(rerender);
    if ('syncNow' in d) { await store.pull(); toast(store.status.error ? esc(store.status.error) : '✓ Synced', store.status.error ? 'var(--red)' : 'var(--good)'); }
    if ('share' in d) return shareSetup();
    if ('disconnect' in d) {
      if (await confirmSheet('Disconnect this device?', 'It will keep a local copy but stop syncing.', { ok: 'Disconnect' })) store.disconnect();
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

    if ('connect' in f.dataset) {
      try {
        let conf;
        const code = f.code.value.trim();
        if (code) conf = store.parseSetupCode(code.split('#/setup/').pop());
        else conf = { accessKey: f.accessKey.value.trim(), bins: Object.fromEntries(['household', ...kids().map((k) => k.id)].map((b) => [b, f[b].value.trim()])) };
        await connectFlow(conf);
        rerender();
      } catch (err) {
        toast(esc(err.message || 'That setup code didn’t work'), 'var(--red)');
      }
    }
  });
}

/** Shared by the admin form and #/setup/<code> links. */
export async function connectFlow(conf) {
  let mergeLocal = false;
  if (store.hasLocalActivity()) {
    mergeLocal = await confirmSheet('Keep this device’s coins?',
      'This device already has coins or requests. Add them to the shared bins? Choose Cancel if this was just testing.', { ok: 'Add them', icon: '🪙' });
  }
  await store.connect(conf, { mergeLocal });
  toast('✓ Connected to JSONBin', 'var(--good)');
}

async function shareSetup() {
  const url = `${location.origin}${location.pathname}#/setup/${store.setupCode()}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Ervin Central setup', url });
    else { await navigator.clipboard.writeText(url); toast('Setup link copied'); }
  } catch { /* share sheet dismissed */ }
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
