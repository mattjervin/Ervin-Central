// Shell: hash router, top bar, nav, live clock, and the kiosk behaviors a wall display needs
// (keep the screen awake, drift back to Home when nobody's touching it, repaint at midnight).

import { loadConfig, cfg, kids } from './data.js';
import { store } from './store.js';
import { isParent, lockParent, requireParent, toast } from './ui.js';
import { $, $$, esc, clock, ymd } from './util.js';
import * as home from './views/home.js';
import * as calendar from './views/calendar.js';
import * as school from './views/school.js';
import * as chores from './views/chores.js';
import * as coins from './views/coins.js';
import * as admin from './views/admin.js';

const ROUTES = { home, calendar, school, chores, coins, admin };

function parseHash() {
  const [name, ...params] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: ROUTES[name] ? name : 'home', params };
}

function render() {
  const { name, params } = parseHash();
  const view = ROUTES[name];
  const [lead, accent] = view.title;
  $('#page-title').innerHTML = `${esc(lead)} <span>${esc(accent)}</span>`;
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));

  // A fresh element per render, so views can bind listeners to it without piling them up.
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = view.render(params);
  const scroll = $('#main').scrollTop;
  const sameView = $('#main').dataset.view === name;
  $('#main').replaceChildren(el);
  $('#main').dataset.view = name;
  $('#main').scrollTop = sameView ? scroll : 0; // a tap re-render keeps its place; a new page starts at the top
  view.mount?.(el, render, params);
  tick();
}

function tick() {
  const now = new Date();
  $$('[data-clock]').forEach((c) => { c.textContent = clock(now, false); });
  document.body.classList.toggle('parent', isParent());
  const pend = store.allPending().length;
  const badge = $('#coins-badge');
  badge.textContent = pend || '';
  badge.hidden = !pend;

  const s = store.status;
  const dot = $('#sync-dot');
  dot.hidden = s.mode !== 'jsonbin';
  dot.className = `sync-dot ${s.error ? 'err' : s.pending || s.busy ? 'warn' : 'ok'}`;
  dot.title = s.error ? `Sync problem: ${s.error}` : s.pending ? 'Saving…' : 'Synced';
}

/** Another device changed something: repaint, unless someone is mid-tap in a sheet or a form. */
function onStore(reason) {
  tick();
  if (reason !== 'remote') return;
  if ($('#modal').classList.contains('open')) return;
  if (document.activeElement?.matches('input, textarea, select')) return;
  render();
}

// ---- Setup links: #/setup/<code> carries the JSONBin access key + bin ids ----------------------

async function handleSetup() {
  const m = location.hash.match(/^#\/setup\/(.+)$/);
  if (!m) return false;
  history.replaceState(null, '', `${location.pathname}#/admin`); // don't leave the key in history
  try {
    const conf = store.parseSetupCode(m[1]);
    if (!(await requireParent())) { render(); return true; }
    await admin.connectFlow(conf);
  } catch (err) {
    toast(`Setup failed: ${esc(err.message)}`, 'var(--red)');
  }
  render();
  return true;
}

// ---- Kiosk -------------------------------------------------------------------------------------

let lastTouch = Date.now();
let lastDay = ymd();
let lastPull = Date.now();
let pollMs = 60e3;

function kiosk() {
  pollMs = (cfg.family.sync?.pollSeconds || 60) * 1000;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.sync) { lastPull = Date.now(); store.pull(); }
  });
  const idle = (cfg.family.kiosk?.idleReturnSeconds || 0) * 1000;
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));

  setInterval(() => {
    tick();
    if (ymd() !== lastDay) { lastDay = ymd(); render(); }                 // new day → fresh chores
    if (store.sync && document.visibilityState === 'visible' && Date.now() - lastPull > pollMs) { lastPull = Date.now(); store.pull(); }
    if (idle && Date.now() - lastTouch > idle) {
      lastTouch = Date.now();
      if (isParent()) lockParent();
      if ($('#modal').classList.contains('open')) $('#modal').click();
      if (parseHash().name !== 'home') location.hash = '#/home';
      else render();                                                     // refresh Home's data
    }
  }, 15e3);

  if (cfg.family.kiosk?.keepAwake && 'wakeLock' in navigator) {
    const grab = () => navigator.wakeLock.request('screen').catch(() => {});
    grab();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') grab(); });
  }
}

// ---- Boot --------------------------------------------------------------------------------------

async function boot() {
  try {
    await loadConfig();
  } catch (err) {
    $('#main').innerHTML = `<div class="card"><p class="empty">Couldn’t load the family data (${esc(err.message)}).</p></div>`;
    return;
  }
  store.init(kids().map((k) => k.id));
  store.subscribe(onStore);
  addEventListener('hashchange', () => { if (!/^#\/setup\//.test(location.hash)) render(); else handleSetup(); });
  $('#parent-btn').addEventListener('click', async () => {
    if (isParent()) { lockParent(); render(); return; }
    if (await requireParent()) render();
  });
  if (!(await handleSetup())) render();
  kiosk();
}

boot();
