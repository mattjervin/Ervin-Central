// Parent management — the button at the bottom of every page (or …/Ervin-Central/admin/). Dad's code
// opens Dad's area, Mom's code opens Mom's; each parent manages their own house's jars:
//
//   · Waiting for you — extras and rewards asked of this house
//   · Per girl        — this house's jar: quick ±, custom coins with a note (shows on her coin history),
//                       a kindness catch, coins spent offline, zero out,
//                       recent history
//   · History         — every coin entry, both houses (✕ on your own house's lines)
//   · Who did what    — the chore log (Supabase view ervin_central.chore_log): every change with the
//                       girl, house, date, who entered it (kid code or Dad/Mom) and which device
//   · Notifications   — this parent's phone hears when a girl asks for an OK into their house's jar
//                       (Web Push; js/push.js, sw.js, supabase/ervin_central.sql)
//   · This device     — the name this device writes into the log ('Kitchen iPad'), whose device it is
//                       (me() in data.js) and everyone's home-screen links
//   · Site tools      — sync status, backup/restore and wipe, for passcodes.siteTools only

import { cfg, kids, house, choreById, people, me as deviceOwner, setMe } from '../data.js';
import { pushStatus, enablePush, disablePush, testPush } from '../push.js';
import { store, houseOf } from '../store.js';
import { historyCard } from './coins.js';
import { card, hero, header, avatar, coin, toast, parentNow, hasSiteTools, requireParent, lockParent, confirmSheet, empty, houseTag } from '../ui.js';
import { esc, relDay, clock, ymd } from '../util.js';

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
    ${card(`
      ${header('Notifications', { color: 'var(--amber)', eyebrow: `When a girl asks for ${h.label.replace(/’s$|'s$/, '')}’s OK` })}
      <div id="push-box"><p class="muted small">Checking this device…</p></div>`, 'push-card')}
    <div class="cols two">${kids().map((k) => kidAdmin(k, me)).join('')}</div>
    ${historyCard()}
    ${card(`
      ${header('Who did what', { color: 'var(--acc)', eyebrow: 'Every chore and coin change · both houses' })}
      <div class="pills" id="log-filter">
        <button class="choice-pill selected" data-log="" style="--c:var(--acc)">Everyone</button>
        ${kids().map((k) => `<button class="choice-pill" data-log="${k.id}" style="--c:${esc(k.color)}"><span class="pdot"></span>${esc(k.name)}</button>`).join('')}
      </div>
      <div id="chore-log"><p class="empty">Loading the log…</p></div>`, 'log-card')}
    ${card(`
      ${header('This device', { color: 'var(--t3)' })}
      <form class="field-row" data-device-name>
        <input name="name" type="text" maxlength="40" value="${esc(store.deviceName)}" aria-label="Device name" placeholder="Kitchen iPad, Avery’s iPhone…">
        <button class="btn ok" type="submit">Save name</button>
      </form>
      <p class="muted small">Every chore or coin change from this device is logged with this name.</p>
      <div class="sh-eyebrow dev-l">Whose device</div>
      <div class="pills">${[{ id: '', name: 'Anyone', color: 'var(--acc)' }, ...people()].map((p) => `
        <button class="choice-pill ${(deviceOwner()?.id || '') === p.id ? 'selected' : ''}" data-me="${p.id}" style="--c:${esc(p.color)}">${esc(p.name)}</button>`).join('')}</div>
      <p class="muted small">A girl’s phone opens to her chores with her day first. Each person’s home-screen link below sets this by itself.</p>
      <div class="sh-eyebrow dev-l">Home-screen links</div>
      <ul class="me-links">${people().map((p) => `
        <li style="--c:${esc(p.color)}"><b>${esc(p.name)}</b><code>${esc(personLink(p.id).replace(/^https?:\/\//, ''))}</code>
          <button class="btn ghost" data-share-me="${p.id}" aria-label="Share ${esc(p.name)}’s link">Share</button></li>`).join('')}</ul>
      <p class="muted small">Open the link on that person’s phone, then Share → Add to Home Screen. Already have the app there? Delete it and add it again from the link.</p>`)}
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
      <div class="col-bal"><span class="cb-l">Balance</span><span class="cb-v">${coin()} <b>${bal}</b></span></div>
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

    ${header('Custom coins', { color: 'var(--acc)', eyebrow: `Your note shows on ${k.name}’s coin history` })}
    <form class="spend" data-custom="${k.id}">
      <div class="field-row custom-row">
        <input name="amount" type="number" inputmode="numeric" min="1" max="500" placeholder="Coins" required aria-label="Coins">
        <input name="reason" type="text" maxlength="80" placeholder="Why? (Helped carry groceries without asking)" required aria-label="Why">
      </div>
      <div class="tool-row">
        <button class="btn" type="submit" data-sign="1">＋ Give coins</button>
        <button class="btn" type="submit" data-sign="-1">− Take away</button>
      </div>
    </form>

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
      <li class="row"><span class="row-icon">${e.icon ? esc(e.icon) : coin()}</span>
        <span class="row-main"><span class="row-title">${esc(e.reason)}</span><span class="row-sub">${relDay(new Date(e.ts))} ${clock(new Date(e.ts))}</span></span>
        <span class="amt ${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</span>
        <button class="btn icon ghost" data-remove="${e.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>` : empty('Nothing yet.')}
  `, 'kid-card', 0, `--c:${esc(k.color)}`);
}

/** Each person's home-screen link: …/Ervin-Central/avery/ (forwards to ?me=avery). */
const personLink = (id) => new URL(`${id}/`, location.href.split('#')[0].split('?')[0]).href;

/** The Notifications card's body for this device, for the unlocked parent `me`. */
async function fillPush(root, me) {
  const el = root.querySelector('#push-box');
  if (!el) return;
  const label = (id) => house(id)?.label || id;
  const st = await pushStatus().catch(() => ({ state: 'unsupported' }));
  const hint = `You’ll get a notification when Avery or Evelynn asks for an extra chore or a reward from ${esc(label(me))} jar. Tap it to OK it here.`;
  el.innerHTML = {
    homescreen: `<p class="muted">On iPhone, notifications only work in the home-screen app. Open <b>${esc(personLink(me).replace(/^https?:\/\//, ''))}</b> in Safari, tap Share → <b>Add to Home Screen</b>, open Ervin Central from that icon and turn this on there.</p>`,
    unsupported: '<p class="muted">This browser can’t show notifications. Try the home-screen app on your phone.</p>',
    denied: '<p class="muted">Notifications are blocked for Ervin Central on this device. Allow them (on iPhone: Settings → Notifications → Ervin Central), then come back.</p>',
    off: `<p class="muted small">${hint}</p><div class="tool-row"><button class="btn ok" data-push-on>🔔 Notify me on this device</button></div>`,
    on: st.house === me
      ? `<p class="sync-state ok">🔔 On — this device hears about ${esc(label(me))} jar.</p><div class="tool-row"><button class="btn" data-push-test>Send a test</button><button class="btn ghost" data-push-off>Turn off</button></div>`
      : `<p class="muted">🔔 On for ${esc(label(st.house))} jar on this device.</p><div class="tool-row"><button class="btn ok" data-push-on>Switch to ${esc(label(me))} jar</button><button class="btn ghost" data-push-off>Turn off</button></div>`,
  }[st.state] || '';
}

async function shareLink(id) {
  const p = people().find((x) => x.id === id);
  const url = personLink(id);
  const data = { title: `Ervin Central · ${p.name}`, text: `${p.name}’s Ervin Central — open it, then Share → Add to Home Screen`, url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast(`🔗 ${esc(p.name)}’s link copied`, p.color); } catch { toast(esc(url)); }
}

function syncCard() {
  const s = store.status;
  if (s.mode !== 'cloud') {
    return card(`
      ${header('Sync · this device only', { color: 'var(--amber)' })}
      <p class="muted">No cloud settings in data/site.json → sync, so coins are saved on this device only.</p>`);
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

const WHO = { kid: 'Kid code', dad: 'Dad', mom: 'Mom' };

/** The newest chore-log rows, grouped by day: time · girl · what · coins · house · entered by · device. */
async function fillLog(root, kid = '') {
  const el = root.querySelector('#chore-log');
  if (!el) return;
  try {
    const rows = await store.log({ kid, limit: 80 });
    if (!rows.length) { el.innerHTML = empty('Nothing logged yet.'); return; }
    let day = '';
    el.innerHTML = `<div class="log">${rows.map((r) => {
      const at = new Date(r.created_at);
      const k = kids().find((x) => x.id === r.kid);
      const head = ymd(at) !== day ? `<div class="log-day">${esc(relDay(at))}</div>` : '';
      day = ymd(at);
      const amt = r.coins == null ? '' : `<span class="log-amt ${r.coins < 0 ? 'neg' : ''}">${r.coins > 0 ? '+' : ''}${r.coins}</span>`;
      return `${head}<div class="log-row" style="--c:${esc(k?.color || 'var(--t4)')}">
        <span class="log-t">${esc(clock(at))}</span>
        <span class="log-main"><span><b>${esc(k?.name || r.kid)}</b> · ${esc(r.action)}${r.item ? ` · ${esc(r.item)}` : ''}</span>
          <small>${r.house ? houseTag(r.house) : ''} ${esc(WHO[r.entered_by] || 'Not recorded')} · ${esc(r.device_name || 'unknown device')}</small></span>
        ${amt}</div>`;
    }).join('')}</div>`;
  } catch (err) {
    el.innerHTML = empty(`Couldn’t load the log (${err.message}).`);
  }
}

export function mount(root, rerender) {
  if (parentNow()) { fillLog(root); fillPush(root, parentNow()); }

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    // A form's submit button (Give coins, Take away, Record) belongs to the submit handler below. If this
    // handler re-rendered here, the form would be gone before the browser submits it — nothing saved.
    if (t.form && t.type === 'submit') return;
    const d = t.dataset;

    if ('log' in d) {
      root.querySelectorAll('[data-log]').forEach((b) => b.classList.toggle('selected', b === t));
      fillLog(root, d.log);
      return;
    }

    if ('unlock' in d) { if (await requireParent()) rerender(); return; }
    const me = parentNow() || (await requireParent());
    if (!me) return;
    const kidOf = (id) => kids().find((x) => x.id === id);

    if (d.quick) { t.closest('form').amount.value = d.quick; return; }

    // Notifications. enablePush asks iOS for permission first thing, while this is still the tap.
    if ('pushOn' in d || 'pushTest' in d || 'pushOff' in d) {
      try {
        if ('pushOn' in d) { await enablePush(me, store.deviceName); toast(`🔔 Notifications on for ${esc(house(me).label)} jar`, 'var(--acc)'); }
        if ('pushTest' in d) { await testPush(); toast('🔔 Test sent — it should pop up in a moment', 'var(--acc)'); }
        if ('pushOff' in d) { await disablePush(); toast('🔕 Notifications off on this device', 'var(--t3)'); }
      } catch (err) { toast(esc(err.message), 'var(--red)'); }
      return fillPush(root, me);
    }
    if ('me' in d) {
      const p = setMe(d.me);
      toast(p ? `📱 This device opens as ${esc(p.name)}` : '📱 This device is shared', p?.color || 'var(--acc)');
      return rerender();
    }
    if (d.shareMe) return shareLink(d.shareMe);

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
      if (await confirmSheet(`Zero out ${k.name}’s ${h.label} jar?`, `Takes it from ${coin()} ${store.balance(k.id, me)} to 0. History stays. The other house’s jar isn’t touched.`, { ok: 'Zero out', icon: '🧹' })) {
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

    if ('deviceName' in f.dataset) {
      store.deviceName = f.name.value;
      toast(`📱 This device is “${esc(store.deviceName)}”`, 'var(--acc)');
      return rerender();
    }
    if (f.dataset.custom) {
      const k = kids().find((x) => x.id === f.dataset.custom);
      const amt = Math.abs(parseInt(f.amount.value, 10));
      const note = f.reason.value.trim();
      if (!amt || !note) return;
      const sign = Number(e.submitter?.dataset.sign) < 0 ? -1 : 1;
      store.adjust(k.id, sign * amt, note, me);
      toast(`${sign > 0 ? '🎁' : '✏️'} ${esc(k.name)} ${sign > 0 ? '+' : '−'}${amt} · ${esc(note)}`, k.color);
      return rerender();
    }
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
