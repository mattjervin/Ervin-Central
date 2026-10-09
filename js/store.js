// The one place mutable household state lives: chore check-offs, the Kindness Coin ledger and
// pending approvals — one doc per kid:
//   <kidId> → { v, kid, done: { date: { choreId: ts } }, ledger: [..], pending: [..] }
//
// Shared state lives in Supabase (project "ervin-data", schema `ervin_central`) as an append-only
// log of ops in table `ops` (seq, op_id, bin, op). Every device rebuilds the same docs by
// replaying the log in `seq` order, so nothing is ever overwritten and the log *is* the history.
//
// Every change is a small serializable op run through `apply()`. It's applied locally at once (the
// tap feels instant), queued in an outbox that survives reloads, and POSTed with an `op_id` minted
// up front — a retry of an op that already landed is ignored by the database (unique op_id), so it
// can't double-pay. Sent ops stay laid on top of the view until a pull shows them in the log.
//
// The API key is Supabase's *publishable* key — safe in a public repo. The table allows read and
// insert only: nobody can edit or delete history through the API.
//
// Coin balances are never stored — they're the sum of the ledger.

import { uid, ymd } from './util.js';

const CACHE_KEY = 'ervin-central:cloud';    // { docs, lastSeq, recent } — the replayed log
const OUTBOX_KEY = 'ervin-central:outbox2'; // [{ op_id, bin, op }] not yet confirmed sent
const SENT_KEY = 'ervin-central:sent';      // [{ op_id, bin, op }] sent, not yet seen in a pull
const DEVICE_KEY = 'ervin-central:device';
const LEGACY_KEY = 'ervin-central:v2';      // the old gist/localStorage docs, migrated once
const LEGACY_OLD = 'ervin-central:v1';
const MIGRATED_KEY = 'ervin-central:migrated';
const KEEP_DONE_DAYS = 45;
const PAGE = 1000;                          // PostgREST's max rows per request
const OVERLAP = 50;                         // re-read this many seqs back to catch late commits

let kidIds = [];
let conf = null;                            // { url, key, schema }
let remote = { docs: {}, lastSeq: 0, recent: [] };
let outbox = read(OUTBOX_KEY) || [];
let sent = read(SENT_KEY) || [];
let docs = {};
const device = read(DEVICE_KEY) || (() => { const d = uid(); write(DEVICE_KEY, d); return d; })();
const status = { lastSync: null, error: null, busy: false };
const listeners = new Set();

function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

const blankKid = (kid) => ({ v: 3, kid, done: {}, ledger: [], pending: [] });

function notify(reason) { listeners.forEach((fn) => fn(reason)); }
function saveLocal() { write(CACHE_KEY, remote); write(OUTBOX_KEY, outbox); write(SENT_KEY, sent); }

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
      // Computed against the log as replayed *up to this op*, so every device gets the same answer
      // and it zeroes the real balance even if another device added coins a moment before.
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
  }
  // Keep docs small: old check-offs are only needed for "done today".
  const cutoff = ymd(new Date(Date.now() - KEEP_DONE_DAYS * 864e5));
  for (const d of Object.keys(doc.done || {})) if (d < cutoff || !Object.keys(doc.done[d]).length) delete doc.done[d];
  return doc;
}

/** Fold log rows ({ seq, bin, op }) onto docs in seq order. Rows for unknown bins are skipped. */
function replay(base, rows) {
  const out = base;
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) if (out[r.bin]) apply(out[r.bin], r.op);
  return out;
}

const blankDocs = () => Object.fromEntries(kidIds.map((k) => [k, blankKid(k)]));

/** What the screen shows: the replayed log, then sent-but-unseen ops, then the outbox. */
function rebuildView() {
  docs = structuredClone(remote.docs);
  for (const k of kidIds) docs[k] ||= blankKid(k);
  for (const o of [...sent, ...outbox]) if (docs[o.bin]) apply(docs[o.bin], o.op);
}

function mutate(bin, op) {
  outbox.push({ op_id: uid(), bin, op });
  apply(docs[bin], op);
  saveLocal();
  notify('local');
  flush();
}

// ---- Supabase (PostgREST over plain fetch — no SDK, no build step) ---------------------------

function httpError(what, res, text) {
  const err = new Error(`Cloud ${what} failed (${res.status})${text ? ': ' + text.slice(0, 120) : ''}`);
  err.fatal = res.status === 401 || res.status === 403 || res.status === 404;
  return err;
}

const api = () => `${conf.url}/rest/v1/ops`;
const readHeaders = () => ({ apikey: conf.key, 'Accept-Profile': conf.schema });

/** Every log row with seq > after, oldest first, paging past PostgREST's 1000-row cap. */
async function fetchRows(after) {
  const rows = [];
  for (let from = after; ;) {
    const res = await fetch(`${api()}?select=seq,op_id,bin,op&seq=gt.${from}&order=seq.asc&limit=${PAGE}`, { headers: readHeaders(), cache: 'no-store' });
    if (!res.ok) throw httpError('read', res, await res.text());
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
    from = page[page.length - 1].seq;
  }
}

async function postOps(batch) {
  const res = await fetch(`${api()}?on_conflict=op_id`, {
    method: 'POST',
    headers: { apikey: conf.key, 'Content-Profile': conf.schema, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(batch.map((o) => ({ op_id: o.op_id, bin: o.bin, op: o.op, device }))),
  });
  if (!res.ok) throw httpError('save', res, await res.text());
}

/**
 * Bring `remote` up to date. Reads a little behind lastSeq: a seq that shows up below lastSeq that
 * we have never seen means a slow write committed late, and the only safe fix is a full replay.
 */
async function syncDown() {
  const from = Math.max(0, remote.lastSeq - OVERLAP);
  const rows = await fetchRows(from);
  const seen = new Set(remote.recent);
  const late = rows.some((r) => r.seq <= remote.lastSeq && !seen.has(r.seq));
  let changed = false;
  let seenRows = rows;
  if (late) {
    const all = await fetchRows(0);
    remote = { docs: replay(blankDocs(), all), lastSeq: all.at(-1)?.seq || 0, recent: all.slice(-200).map((r) => r.seq) };
    seenRows = all;
    changed = true;
  } else {
    const fresh = rows.filter((r) => r.seq > remote.lastSeq);
    if (fresh.length) {
      for (const k of kidIds) remote.docs[k] ||= blankKid(k);
      replay(remote.docs, fresh);
      remote.lastSeq = fresh.at(-1).seq;
      remote.recent = [...remote.recent, ...fresh.map((r) => r.seq)].slice(-200);
      changed = true;
    }
  }
  const ids = new Set(seenRows.map((r) => r.op_id));
  const before = sent.length;
  sent = sent.filter((o) => !ids.has(o.op_id));
  if (sent.length !== before) changed = true;
  return changed;
}

let flushing = null;
let retryTimer = null;

function flush() {
  if (!conf || (!flushing && !outbox.length)) return flushing || Promise.resolve();
  flushing ||= (async () => {
    status.busy = true; notify('status');
    try {
      while (outbox.length) {
        const batch = outbox.slice(0, 200);
        await postOps(batch);
        outbox = outbox.slice(batch.length);
        sent.push(...batch);
        saveLocal();
      }
      await syncDown();
      rebuildView(); saveLocal();
      status.error = null; status.lastSync = Date.now();
    } catch (err) {
      status.error = err.message;
      clearTimeout(retryTimer);
      if (!err.fatal) retryTimer = setTimeout(flush, 15e3);
    } finally {
      status.busy = false; flushing = null;
      notify('remote');
      if (outbox.length && !status.error) setTimeout(flush, 0); // ops that landed mid-flush
    }
  })();
  return flushing;
}

// ---- One-time move off the old GitHub Gist / on-device storage -------------------------------

/** Docs this device held before the cloud move (they mirror the old gist when sync was on). */
function legacyDocs() {
  const out = {};
  const v2 = read(LEGACY_KEY);
  for (const k of kidIds) if (v2?.[k]) out[k] = v2[k];
  const v1 = read(LEGACY_OLD);
  if (v1) {
    for (const k of kidIds) out[k] ||= blankKid(k);
    for (const [date, day] of Object.entries(v1.done || {})) {
      for (const [key, ts] of Object.entries(day)) {
        const [choreId, kid] = key.split(':');
        if (out[kid]) (out[kid].done[date] ||= {})[choreId] = ts;
      }
    }
    for (const e of v1.ledger || []) out[e.kid]?.ledger.push(e);
    for (const p of v1.pending || []) out[p.kid]?.pending.push(p);
  }
  return out;
}

/** Push this device's pre-cloud coins up once, as `merge` ops (idempotent by entry id). */
function migrateLegacy() {
  if (read(MIGRATED_KEY)) return;
  const old = legacyDocs();
  for (const [k, d] of Object.entries(old)) {
    if ((d.ledger || []).length || (d.pending || []).length || Object.keys(d.done || {}).length) {
      mutate(k, { t: 'merge', ledger: d.ledger || [], pending: d.pending || [], done: d.done || {} });
    }
  }
  write(MIGRATED_KEY, Date.now());
  if (read(LEGACY_KEY)) write('ervin-central:v2-backup', read(LEGACY_KEY)); // keep a copy, just in case
  for (const k of [LEGACY_KEY, LEGACY_OLD, 'ervin-central:outbox', 'ervin-central:sync']) write(k, null);
}

// ---- Public API ------------------------------------------------------------------------------

export const store = {
  /** Call once config is loaded. `cloud` = { url, key, schema } from family.json → sync. */
  init(ids, cloud) {
    kidIds = ids;
    conf = cloud?.url && cloud?.key ? { url: cloud.url.replace(/\/$/, ''), key: cloud.key, schema: cloud.schema || 'public' } : null;
    remote = read(CACHE_KEY) || { docs: {}, lastSeq: 0, recent: [] };
    for (const k of ids) remote.docs[k] ||= blankKid(k);
    rebuildView();
    migrateLegacy();
    saveLocal();
    store.pull().then(() => flush());
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

  /** Erase a kid's history entirely — ledger, requests, and check-offs. (The log keeps the record.) */
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

  // ---- Backup ----
  exportJson() { return JSON.stringify({ app: 'ervin-central', v: 3, docs }, null, 2); },

  /** Merges a backup in (by entry id), so restoring never duplicates coins. */
  importJson(text) {
    const b = JSON.parse(text);
    if (b?.app !== 'ervin-central' || !b.docs) throw new Error('Not an Ervin Central backup');
    for (const k of kidIds) if (b.docs[k]) mutate(k, { t: 'merge', ...b.docs[k] });
  },

  // ---- Sync ----
  get sync() { return conf; },
  get status() { return { ...status, pending: outbox.length + sent.length, mode: conf ? 'cloud' : 'local', lastSeq: remote.lastSeq, device }; },

  /** Pull new log rows. Safe to call often: it only reads what's past the last seq it saw. */
  async pull() {
    if (!conf) return;
    if (flushing) return flushing;
    try {
      const changed = await syncDown();
      status.error = null; status.lastSync = Date.now();
      if (changed) { rebuildView(); saveLocal(); notify('remote'); } else notify('status');
    } catch (err) {
      status.error = err.message; notify('status');
    }
  },

  /** Throw away the local copy and replay the whole log from the cloud. */
  async resync() {
    if (!conf) return;
    remote = { docs: blankDocs(), lastSeq: 0, recent: [] };
    saveLocal();
    await store.pull();
  },
};

/** For tests: the op reducer and the log replayer. */
export { apply as applyOp, replay };

/** SHA-256 of a passcode, so the codes don't sit in the public source as plain digits. Not real security. */
export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ervin-central:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
