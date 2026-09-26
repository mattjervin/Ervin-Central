// Shell: hash router, top bar, nav, live clock, and the kiosk behaviors a wall display needs
// (keep the screen awake, drift back to Home when nobody's touching it, repaint at midnight).

import { loadConfig, cfg } from './data.js';
import { store } from './store.js';
import { isParent, lockParent } from './ui.js';
import { $, $$, esc, clock, ymd } from './util.js';
import * as home from './views/home.js';
import * as calendar from './views/calendar.js';
import * as school from './views/school.js';
import * as chores from './views/chores.js';
import * as coins from './views/coins.js';

const ROUTES = { home, calendar, school, chores, coins };

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
  const pend = store.state.pending.length;
  const badge = $('#coins-badge');
  badge.textContent = pend || '';
  badge.hidden = !pend;
}

// ---- Kiosk -------------------------------------------------------------------------------------

let lastTouch = Date.now();
let lastDay = ymd();

function kiosk() {
  const idle = (cfg.family.kiosk?.idleReturnSeconds || 0) * 1000;
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));

  setInterval(() => {
    tick();
    if (ymd() !== lastDay) { lastDay = ymd(); render(); }                 // new day → fresh chores
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
  store.subscribe(tick);
  addEventListener('hashchange', render);
  $('#parent-btn').addEventListener('click', async () => {
    if (isParent()) { lockParent(); render(); return; }
    const { requireParent } = await import('./ui.js');
    if (await requireParent()) render();
  });
  render();
  kiosk();
}

boot();
