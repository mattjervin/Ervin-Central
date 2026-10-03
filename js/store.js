// The one place mutable household state lives: chore check-offs, the Kindness Coin ledger,
// pending approvals, and the parent PIN.
//
// State is split into documents that map 1:1 onto files in one secret GitHub Gist:
//   household.json → { v, pinHash }
//   <kidId>.json   → { v, kid, done: { date: { choreId: ts } }, ledger: [..], pending: [..] }
// A save PATCHes only the files it changed, so two iPads ticking different girls' chores never
// touch the same file. Every save is a gist revision — that's the history and the undo.
//
// Every change is a small serializable op run through `apply()`. It's applied locally at once
// (the tap feels instant), queued in an outbox that survives reloads, and replayed onto the
// *latest* copy of the gist before each PATCH. Ops are idempotent (ids are minted up front) so a
// retry can't double-pay. A gist PATCH is last-write-wins, so ops leave the outbox only once a
// later read shows they stuck — if another device's save landed on top, they're simply sent again.
//
// Coin balances are never stored — they're the sum of the ledger.
//
// With no sync configured, the same docs simply live in localStorage.

import { uid, ymd } from './util.js';

const KEY = 'ervin-central:v2';
const OLD_KEY = 'ervin-central:v1';
const OUTBOX_KEY = 'ervin-central:outbox';
const SYNC_KEY = 'ervin-central:sync';
const API = 'https://api.github.com/gists/';
const KEEP_DONE_DAYS = 45;
const SETTLE_MS = 3000;      // wait before checking a save stuck, so a racing save has landed
const SAVE_TRIES = 3;

let kidIds = [];
let docs = {};
let outbox = read(OUTBOX_KEY) || [];
let sync = read(SYNC_KEY);   // { token, gistId } | null
if (sync && !sync.gistId) { sync = null; write(SYNC_KEY, null); } // old JSONBin config
const status = { lastSync: null, error: null, busy: false };
const listeners = new Set();

function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

const blankKid = (kid) => ({ v: 2, kid, done: {}, ledger: [], pending: [] });
const blankHousehold = () => ({ v: 2, pinHash: null });

function notify(reason) { listeners.forEach((fn) => fn(reason)); }
function saveLocal() { write(KEY, docs); write(OUTBOX_KEY, outbox); }

// ---- Ops ------------------------------------------------------------------------------------

function balanceOf(doc) { return (doc.ledger || []).reduce((s, e) => s + e.amount, 0); }

/** Apply one op to one doc, in place. Must be idempotent. */
function apply(doc, op) {
  doc.done ||= {}; doc.ledger ||= []; doc.pending ||= [];
  const hasEntry = (id) => doc.ledger.some((e) => e.id === id);
  switch (op.t) {
    case 'chore': {
      const day = (doc.done[op.date] ||= {});
      if (op.on) {
        day[op.choreId] ||= op.ts;
        if (!doc.ledger.some((e) => e.ref === op.entry.ref)) doc.ledger.push(op.entry);
      } else {
        delete day[op.choreId];
        doc.ledger = doc.ledger.filter((e) => e.ref !== op.ref);
      }
      break;
    }
    case 'request':
      if (!doc.pending.some((p) => p.id === op.item.id)) doc.pending.push(op.item);
      break;
    case 'approve': {
      const p = doc.pending.find((x) => x.id === op.id);
      if (!p) break;
      doc.pending = doc.pending.filter((x) => x.id !== op.id);
      if (!hasEntry(op.entryId)) doc.ledger.push({ id: op.entryId, kid: p.kid, amount: p.amount, reason: p.title, icon: p.icon, type: p.type, ref: p.ref, ts: op.ts });
      break;
    }
    case 'decline':
      doc.pending = doc.pending.filter((x) => x.id !== op.id);
      break;
    case 'entry':
      if (!hasEntry(op.entry.id)) doc.ledger.push(op.entry);
      break;
    case 'remove':
      doc.ledger = doc.ledger.filter((e) => e.id !== op.id);
      break;
    case 'zero': {
      // Computed against whatever the gist holds *now*, so it zeroes the real balance even if
      // another device added coins a moment ago.
      if (hasEntry(op.id)) break;
      const bal = balanceOf(doc);
      if (bal !== 0) doc.ledger.push({ id: op.id, kid: doc.kid, amount: -bal, reason: op.reason, icon: '🧹', type: 'reset', ts: op.ts });
      break;
    }
    case 'wipe':
      doc.done = {}; doc.ledger = []; doc.pending = [];
      break;
    case 'merge':
      for (const e of op.ledger || []) if (!hasEntry(e.id)) doc.ledger.push(e);
      for (const p of op.pending || []) if (!doc.pending.some((x) => x.id === p.id)) doc.pending.push(p);
      for (const [date, day] of Object.entries(op.done || {})) Object.assign((doc.done[date] ||= {}), day);
      break;
    case 'pin':
      doc.pinHash = op.hash;
      break;
  }
  // Keep the files small: old check-offs are only needed for "done today".
  const cutoff = ymd(new Date(Date.now() - KEEP_DONE_DAYS * 864e5));
  for (const d of Object.keys(doc.done || {})) if (d < cutoff || !Object.keys(doc.done[d]).length) delete doc.done[d];
  return doc;
}

/** True when replaying these ops onto doc would change nothing — i.e. they already landed. */
function isApplied(doc, ops) {
  const base = apply(structuredClone(doc), { t: 'noop' }); // same normalising and pruning
  const after = structuredClone(base);
  for (const op of ops) apply(after, op);
  return JSON.stringify(after) === JSON.stringify(base);
}

function mutate(bin, op) {
  apply(docs[bin], op);
  if (sync) outbox.push({ bin, op });
  saveLocal();
  notify('local');
  if (sync) flush();
}

// ---- GitHub Gist ---------------------------------------------------------------------------

/** 401/404 = wrong token or gist id (retrying won't help); anything else is worth another try. */
function httpError(what, code) {
  const fatal = code === 401 || code === 404;
  const err = new Error(fatal ? `GitHub ${what} ${code} — check the token in Admin → Sync` : `GitHub ${what} ${code}`);
  err.fatal = fatal;
  return err;
}

const headers = () => ({ Authorization: `Bearer ${sync.token}`, Accept: 'application/vnd.github+json' });
const blankFor = (bin) => (bin === 'household' ? blankHousehold() : blankKid(bin));
let etag = null;

/** Every doc in one request. With `ifChanged`, resolves null when nothing moved (a 304 is free). */
async function getGist({ ifChanged = false } = {}) {
  const h = headers();
  if (ifChanged && etag) h['If-None-Match'] = etag;
  const res = await fetch(API + sync.gistId, { headers: h, cache: 'no-store' });
  if (res.status === 304) return null;
  if (!res.ok) throw httpError('read', res.status);
  etag = res.headers.get('ETag');
  const { files } = await res.json();
  const out = {};
  for (const bin of ['household', ...kidIds]) {
    const f = files[`${bin}.json`];
    // The API inlines up to 1 MB per file; past that, the content comes from the raw URL.
    const text = !f ? null : f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    out[bin] = { ...blankFor(bin), ...(text ? JSON.parse(text) : {}) };
  }
  return out;
}

async function patchGist(changed) {
  const files = Object.fromEntries(Object.entries(changed).map(([bin, doc]) => [`${bin}.json`, { content: serialize(doc) }]));
  const res = await fetch(API + sync.gistId, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw httpError('save', res.status);
}

/** One entry per line, so a gist revision diff reads like a list of what changed. */
function serialize(doc) {
  const inner = (v) => (Array.isArray(v) ? v.map((x) => `    ${JSON.stringify(x)}`)
    : Object.entries(v).map(([k, x]) => `    ${JSON.stringify(k)}: ${JSON.stringify(x)}`)).join(',\n');
  const field = ([k, v]) => {
    const open = Array.isArray(v) ? '[' : '{';
    const nested = v && typeof v === 'object' && Object.keys(v).length;
    return `  ${JSON.stringify(k)}: ${nested ? `${open}\n${inner(v)}\n  ${open === '[' ? ']' : '}'}` : JSON.stringify(v)}`;
  };
  return `{\n${Object.entries(doc).map(field).join(',\n')}\n}\n`;
}

/**
 * One save round: read the latest docs, lay the batch on, write the changed files, let any racing
 * save land, then read again. A bin's ops count as saved only if the re-read already contains them.
 */
async function saveBatch(io, batch, settleMs = SETTLE_MS) {
  const fresh = await io.get();
  const bins = [...new Set(batch.map((o) => o.bin))];
  const opsFor = (bin) => batch.filter((o) => o.bin === bin).map((o) => o.op);
  const changed = {};
  for (const bin of bins) changed[bin] = opsFor(bin).reduce(apply, structuredClone(fresh[bin]));
  await io.patch(changed);
  if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
  const saved = await io.get();
  const okBins = bins.filter((bin) => isApplied(saved[bin], opsFor(bin)));
  return { saved, ok: batch.filter((o) => okBins.includes(o.bin)) };
}

/** Latest remote copy with this device's still-unsent ops laid on top. */
function withOutbox(bin, remote) {
  const doc = structuredClone(remote);
  for (const o of outbox) if (o.bin === bin) apply(doc, o.op);
  return doc;
}

let flushing = null;
let retryTimer = null;
let flushes = 0; // bumped after every successful save, so a pull that started earlier can tell it's stale

function flush() {
  // Nothing to send: return before the async body, which would otherwise finish synchronously
  // and clear `flushing` before it is even assigned — leaving it stuck and blocking every pull.
  if (!sync || (!flushing && !outbox.length)) return flushing || Promise.resolve();
  flushing ||= (async () => {
    status.busy = true; notify('status');
    try {
      for (let tries = 0; outbox.length; tries++) {
        if (tries >= SAVE_TRIES) throw new Error('GitHub save kept getting overwritten — trying again soon');
        const batch = [...outbox];
        const { saved, ok } = await saveBatch({ get: getGist, patch: patchGist }, batch);
        if (ok.length) tries = -1; // progress — the next round starts fresh
        outbox = outbox.filter((o) => !ok.includes(o));
        for (const bin of Object.keys(saved)) docs[bin] = withOutbox(bin, saved[bin]);
        flushes++;
        saveLocal();
      }
      status.error = null;
      status.lastSync = Date.now();
    } catch (err) {
      status.error = err.message;
      clearTimeout(retryTimer);
      if (!err.fatal) retryTimer = setTimeout(flush, 20e3);
    } finally {
      status.busy = false; flushing = null;
      notify('remote');
      if (outbox.length && !status.error) setTimeout(flush, 0); // ops that landed mid-flush
    }
  })();
  return flushing;
}

// ---- Public API ------------------------------------------------------------------------------

export const store = {
  /** Call once config is loaded. Creates docs for every kid and migrates v1 local state. */
  init(ids) {
    kidIds = ids;
    docs = read(KEY) || {};
    docs.household ||= blankHousehold();
    for (const k of ids) docs[k] ||= blankKid(k);

    const old = read(OLD_KEY);
    if (old) {
      for (const [date, day] of Object.entries(old.done || {})) {
        for (const [key, ts] of Object.entries(day)) {
          const [choreId, kid] = key.split(':');
          if (docs[kid]) (docs[kid].done[date] ||= {})[choreId] = ts;
        }
      }
      for (const e of old.ledger || []) docs[e.kid]?.ledger.push(e);
      for (const p of old.pending || []) docs[p.kid]?.pending.push(p);
      if (old.settings?.pinHash) docs.household.pinHash ||= old.settings.pinHash;
      write(OLD_KEY, null);
    }
    saveLocal();
    if (sync) { flush(); store.pull(); }
  },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- Chores ----
  isDone(date, choreId, kid) { return Boolean(docs[kid]?.done[date]?.[choreId]); },

  toggleChore(chore, kid, date = ymd()) {
    const on = !store.isDone(date, chore.id, kid);
    const ref = `${date}:${chore.id}:${kid}`;
    const ts = Date.now();
    mutate(kid, { t: 'chore', date, choreId: chore.id, on, ts, ref,
      entry: { id: uid(), kid, amount: chore.coins, reason: chore.title, icon: chore.icon, type: 'chore', ref, ts } });
    return on;
  },

  // ---- Requests that wait for a parent ----
  request(kid, type, item) {
    const amount = type === 'reward' ? -item.cost : item.coins;
    mutate(kid, { t: 'request', item: { id: uid(), kid, type, ref: item.id, title: item.title, icon: item.icon, amount, ts: Date.now() } });
  },

  allPending() { return kidIds.flatMap((k) => docs[k].pending).sort((a, b) => a.ts - b.ts); },
  pendingFor(kid) { return docs[kid]?.pending || []; },

  approve(id) {
    const p = store.allPending().find((x) => x.id === id);
    if (!p) return;
    if (p.amount < 0 && store.balance(p.kid) + p.amount < 0) throw new Error('Not enough coins');
    mutate(p.kid, { t: 'approve', id, entryId: uid(), ts: Date.now() });
  },

  decline(id) {
    const p = store.allPending().find((x) => x.id === id);
    if (p) mutate(p.kid, { t: 'decline', id });
  },

  // ---- Parent edits ----
  adjust(kid, amount, reason) {
    mutate(kid, { t: 'entry', entry: { id: uid(), kid, amount, reason: reason || (amount > 0 ? 'Bonus from a parent' : 'Adjustment'), icon: amount > 0 ? '🎁' : '✏️', type: 'adjust', ts: Date.now() } });
  },

  /** Coins spent in real life (a store trip, a treat) — recorded so the history explains it. */
  spend(kid, amount, reason) {
    mutate(kid, { t: 'entry', entry: { id: uid(), kid, amount: -Math.abs(amount), reason: reason || 'Spent', icon: '🛍️', type: 'spend', ts: Date.now() } });
  },

  /** Bring a balance to exactly 0, keeping history. */
  zero(kid, reason = 'Coins cashed in') { mutate(kid, { t: 'zero', id: uid(), reason, ts: Date.now() }); },

  /** Erase a kid's history entirely — ledger, requests, and check-offs. */
  wipe(kid) { mutate(kid, { t: 'wipe' }); },

  removeEntry(id) {
    const e = kidIds.flatMap((k) => docs[k].ledger).find((x) => x.id === id);
    if (e) mutate(e.kid, { t: 'remove', id });
  },

  // ---- Coins ----
  balance(kid) { return docs[kid] ? balanceOf(docs[kid]) : 0; },

  /** Coins *earned* (not spent) per day for the last n days, oldest first. */
  earnedByDay(kid, n = 7) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = ymd(d);
      const sum = (docs[kid]?.ledger || []).filter((e) => e.amount > 0 && ymd(new Date(e.ts)) === key).reduce((s, e) => s + e.amount, 0);
      out.push({ date: key, sum });
    }
    return out;
  },

  history(kid, limit = 30) {
    const all = kid ? docs[kid]?.ledger || [] : kidIds.flatMap((k) => docs[k].ledger);
    return [...all].sort((a, b) => b.ts - a.ts).slice(0, limit);
  },

  // ---- PIN ----
  get pinHash() { return docs.household?.pinHash || null; },
  setPinHash(hash) { mutate('household', { t: 'pin', hash }); },

  // ---- Backup ----
  exportJson() { return JSON.stringify({ app: 'ervin-central', v: 2, docs }, null, 2); },

  /** Merges a backup in (by entry id), so restoring never duplicates coins. */
  importJson(text) {
    const b = JSON.parse(text);
    if (b?.app !== 'ervin-central' || !b.docs) throw new Error('Not an Ervin Central backup');
    for (const k of kidIds) if (b.docs[k]) mutate(k, { t: 'merge', ...b.docs[k] });
    if (b.docs.household?.pinHash && !store.pinHash) store.setPinHash(b.docs.household.pinHash);
  },

  // ---- Sync ----
  get sync() { return sync; },
  get status() { return { ...status, pending: outbox.length, mode: sync ? 'gist' : 'local' }; },

  /** Pull every doc. Remote wins, with this device's unsent ops re-applied on top. */
  async pull() {
    if (!sync || flushing) return;
    const seen = flushes;
    try {
      const got = await getGist({ ifChanged: true });
      if (flushes !== seen || flushing) return; // a save landed mid-pull; this copy predates it
      status.error = null; status.lastSync = Date.now();
      if (!got) { notify('status'); return; } // 304 — nothing moved
      const before = JSON.stringify(docs);
      for (const bin of Object.keys(got)) docs[bin] = withOutbox(bin, got[bin]);
      saveLocal();
      notify(JSON.stringify(docs) === before ? 'status' : 'remote');
    } catch (err) {
      status.error = err.message; notify('status');
    }
  },

  /** Point this device at the gist. Optionally push what this device already has. */
  async connect(cfg, { mergeLocal = false } = {}) {
    if (!cfg.token || !cfg.gistId) throw new Error(`Missing ${cfg.token ? 'gist id' : 'GitHub token'}`);
    const local = structuredClone(docs);
    sync = { token: cfg.token, gistId: cfg.gistId };
    outbox = []; etag = null;
    await store.pull();
    if (status.error) { sync = null; throw new Error(status.error); }
    write(SYNC_KEY, sync);
    if (mergeLocal) {
      for (const k of kidIds) mutate(k, { t: 'merge', ledger: local[k].ledger, pending: local[k].pending, done: local[k].done });
      if (local.household.pinHash && !store.pinHash) store.setPinHash(local.household.pinHash);
    }
  },

  disconnect() {
    sync = null; outbox = [];
    write(SYNC_KEY, null);
    saveLocal();
    notify('status');
  },

  /** Base64url setup code carrying the token + gist id, for #/setup/<code>. */
  setupCode() { return sync ? btoa(JSON.stringify(sync)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null; },

  parseSetupCode(code) {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  },

  hasLocalActivity() { return kidIds.some((k) => docs[k].ledger.length || docs[k].pending.length); },
};

/** For tests: the op reducer, the saved-yet check, one save round and the gist file format. */
export { apply as applyOp, isApplied, saveBatch, serialize };

/** SHA-256 of the PIN. Keeps kids from reading it out of the gist; it is not real security. */
export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ervin-central:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
