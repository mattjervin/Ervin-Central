// Shell: hash router, the sticky top nav (sliding active pill, compacts on scroll), live clock and
// countdowns, the motion layer (fireflies, count-up numbers), and the kiosk behaviors a wall display
// needs (keep the screen awake, drift back to Home when idle, repaint at midnight).

import { loadConfig, cfg, kids, weather } from './data.js';
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

let current = null;

function render() {
  const { name, params } = parseHash();
  const view = ROUTES[name];
  document.title = name === 'home' ? 'Ervin Central' : `${view.title} · Ervin Central`;
  $$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));
  moveGlider();

  // A fresh element per render, so views can bind listeners to it without piling them up.
  const el = document.createElement('div');
  el.className = 'view';
  const key = `${name}/${params.join('/')}`;
  const sameView = current === key;
  el.classList.toggle('settled', sameView); // entrance animations only when arriving on a page
  el.innerHTML = view.render(params);
  const y = scrollY;
  $('#main').replaceChildren(el);
  current = key;
  scrollTo(0, sameView ? y : 0); // a tap re-render keeps its place; a new page starts at the top
  view.mount?.(el, render, params);
  if (!sameView) countUp(el);
  tick();
}

// ---- Motion ------------------------------------------------------------------------------------

/** The active-tab pill slides between tabs instead of jumping. */
function moveGlider() {
  const on = $('#tabs a.on');
  const g = $('.tab-glider');
  if (!on) { g.style.opacity = 0; return; }
  g.style.opacity = 1;
  g.style.setProperty('--x', `${on.offsetLeft}px`);
  g.style.setProperty('--w', `${on.offsetWidth}px`);
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Numbers tick up from 0 when a page opens. */
function countUp(root) {
  if (reduced) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = Number(el.dataset.count);
    if (!to) continue;
    const t0 = performance.now();
    const dur = 700 + Math.min(600, Math.abs(to) * 8);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }
}

/** Fireflies drifting up the background — the site's ambient "live" layer. */
function fireflies() {
  if (reduced) return;
  const host = $('#fireflies');
  host.innerHTML = Array.from({ length: 18 }, () => {
    const r = Math.random;
    return `<i style="left:${(r() * 100).toFixed(1)}%;top:${(40 + r() * 60).toFixed(1)}%;--s:${(2 + r() * 3).toFixed(1)}px;--t:${(14 + r() * 16).toFixed(1)}s;--d:${(-r() * 30).toFixed(1)}s;--dx:${(r() * 120 - 60).toFixed(0)}px;--o:${(0.35 + r() * 0.5).toFixed(2)}"></i>`;
  }).join('');
}

/** The nav tightens and gains a glow once the page scrolls under it. */
function stickyNav() {
  const nav = $('#topnav');
  const on = () => nav.classList.toggle('scrolled', scrollY > 12);
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', moveGlider);
  on();
}

function countdownText(ms) {
  if (ms <= 0) return 'now';
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function seconds() {
  const now = new Date();
  for (const c of $$('[data-clock]')) {
    if (c.dataset.clock === 'long') {
      const h = now.getHours() % 12 || 12;
      c.innerHTML = `${h}<span class="colon">:</span>${String(now.getMinutes()).padStart(2, '0')}<small>${now.getHours() >= 12 ? 'pm' : 'am'}</small>`;
    } else c.textContent = clock(now, false);
  }
  for (const u of $$('[data-until]')) u.textContent = countdownText(Number(u.dataset.until) - now);
}

let lastMinute = new Date().getMinutes();

function tick() {
  seconds();
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
    seconds();
    const m = new Date().getMinutes();
    if (m !== lastMinute) { lastMinute = m; ROUTES[parseHash().name].minute?.($('#main .view')); }
  }, 1000);

  const topWx = () => weather().then((w) => { $('#tn-wx').innerHTML = `${w.now.icon} ${w.now.temp}°`; }).catch(() => {});
  topWx();
  setInterval(topWx, 20 * 60e3);

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
    $('#main').innerHTML = `<div class="card" style="margin-top:40px"><p class="empty">Couldn’t load the family data (${esc(err.message)}).</p></div>`;
    return;
  }
  store.init(kids().map((k) => k.id));
  store.subscribe(onStore);
  addEventListener('hashchange', () => { if (!/^#\/setup\//.test(location.hash)) render(); else handleSetup(); });
  $('#parent-btn').addEventListener('click', async () => {
    if (isParent()) { lockParent(); render(); return; }
    if (await requireParent()) render();
  });
  fireflies();
  stickyNav();
  if (!(await handleSetup())) render();
  kiosk();
  document.fonts?.ready.then(moveGlider); // tab widths change once Inter arrives
}

boot();
