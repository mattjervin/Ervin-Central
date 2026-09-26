// The one place mutable household state lives: chore check-offs, the Kindness Coin ledger,
// pending approvals, and device settings.
//
// Coin balances are never stored — they're the sum of the ledger, so a balance can always be
// explained line by line, and undoing a chore is just removing its ledger row.
//
// Persistence is localStorage behind `backend`, deliberately a two-method seam (load/save).
// Right now each device keeps its own state; swapping in a shared backend (Supabase, Firebase,
// a small Worker) means replacing `backend` and nothing else. See README → "Shared state".

import { uid, ymd } from './util.js';

const KEY = 'ervin-central:v1';

const backend = {
  load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: live in memory */ }
  },
};

const blank = () => ({
  v: 1,
  done: {},       // { "2026-09-26": { "make-bed:avery": 1727380000000 } }
  ledger: [],     // [{ id, kid, amount, reason, type: chore|bonus|reward|adjust, ref, ts }]
  pending: [],    // [{ id, kid, type: bonus|reward, ref, title, icon, amount, ts }]
  settings: { pinHash: null },
});

let state = { ...blank(), ...(backend.load() || {}) };
const listeners = new Set();

function commit() {
  backend.save(state);
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get state() { return state; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- Chores ---------------------------------------------------------------------------
  isDone(date, choreId, kid) {
    return Boolean(state.done[date]?.[`${choreId}:${kid}`]);
  },

  /** Tick or untick a daily chore. Coins land (or leave) immediately — kids see the reward. */
  toggleChore(chore, kid, date = ymd()) {
    const key = `${chore.id}:${kid}`;
    const ref = `${date}:${key}`;
    const day = (state.done[date] ||= {});
    if (day[key]) {
      delete day[key];
      state.ledger = state.ledger.filter((e) => e.ref !== ref);
    } else {
      day[key] = Date.now();
      state.ledger.push({ id: uid(), kid, amount: chore.coins, reason: chore.title, icon: chore.icon, type: 'chore', ref, ts: Date.now() });
    }
    commit();
    return Boolean(day[key]);
  },

  // ---- Bonus tasks and rewards (both wait for a parent) -----------------------------------
  request(kid, type, item) {
    const amount = type === 'reward' ? -item.cost : item.coins;
    state.pending.push({ id: uid(), kid, type, ref: item.id, title: item.title, icon: item.icon, amount, ts: Date.now() });
    commit();
  },

  pendingFor(kid) { return state.pending.filter((p) => p.kid === kid); },

  approve(id) {
    const p = state.pending.find((x) => x.id === id);
    if (!p) return;
    if (p.amount < 0 && store.balance(p.kid) + p.amount < 0) throw new Error('Not enough coins');
    state.pending = state.pending.filter((x) => x.id !== id);
    state.ledger.push({ id: uid(), kid: p.kid, amount: p.amount, reason: p.title, icon: p.icon, type: p.type, ref: p.ref, ts: Date.now() });
    commit();
  },

  decline(id) {
    state.pending = state.pending.filter((x) => x.id !== id);
    commit();
  },

  adjust(kid, amount, reason) {
    state.ledger.push({ id: uid(), kid, amount, reason: reason || (amount > 0 ? 'Bonus from a parent' : 'Adjustment'), icon: amount > 0 ? '🎁' : '✏️', type: 'adjust', ts: Date.now() });
    commit();
  },

  removeEntry(id) {
    state.ledger = state.ledger.filter((e) => e.id !== id);
    commit();
  },

  // ---- Coins ----------------------------------------------------------------------------
  balance(kid) {
    return state.ledger.reduce((s, e) => (e.kid === kid ? s + e.amount : s), 0);
  },

  /** Coins *earned* (not spent) per day for the last n days, oldest first. */
  earnedByDay(kid, n = 7) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = ymd(d);
      const sum = state.ledger
        .filter((e) => e.kid === kid && e.amount > 0 && ymd(new Date(e.ts)) === key)
        .reduce((s, e) => s + e.amount, 0);
      out.push({ date: key, sum });
    }
    return out;
  },

  history(kid, limit = 30) {
    return state.ledger.filter((e) => !kid || e.kid === kid).sort((a, b) => b.ts - a.ts).slice(0, limit);
  },

  // ---- Settings & backup ----------------------------------------------------------------
  setPinHash(hash) { state.settings.pinHash = hash; commit(); },

  exportJson() { return JSON.stringify(state, null, 2); },

  importJson(text) {
    const next = JSON.parse(text);
    if (!next || next.v !== 1 || !Array.isArray(next.ledger)) throw new Error('Not an Ervin Central backup');
    state = { ...blank(), ...next };
    commit();
  },
};

/** SHA-256 of the PIN. Keeps kids from reading it out of storage; it is not real security. */
export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ervin-central:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
