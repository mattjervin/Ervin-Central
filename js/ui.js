// Ervin Central's building blocks, in the Catan companion's vocabulary: Cinzel page heroes with a
// gradient key word, mono eyebrows, glass cards that animate in, choice pills, stat tiles with one
// hero tile, hexagon avatars. Plus the touch-only pieces: modal sheet, toast, PIN pad.

import { $, esc } from './util.js';
import { store, hashPin } from './store.js';

/** Card. `i` staggers its entrance animation. */
export const card = (body, cls = '', i = 0, style = '') => `<section class="card ${cls}" style="--i:${i};${style}">${body}</section>`;

/** Page hero: eyebrow · Cinzel headline with a gradient key word · optional lede. */
export function hero(eyebrow, lead, accent, lede = '', aside = '') {
  return `<header class="page-hero">
    <div class="ph-text">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1 class="headline">${esc(lead)} <em>${esc(accent)}</em></h1>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
    </div>${aside}
  </header>`;
}

/** Card header: small hex marker, Cinzel title, optional badge and "see all" link. */
export function header(title, { color = 'var(--acc)', badge, badgeColor, href, eyebrow } = {}) {
  const b = badge != null ? `<span class="badge" style="--c:${esc(badgeColor || color)}">${esc(badge)}</span>` : '';
  const more = href ? `<a class="sh-more" href="${href}">View <span aria-hidden="true">→</span></a>` : '';
  return `<header class="sh" style="--c:${esc(color)}">
    <span class="hexdot" aria-hidden="true"></span>
    <div class="sh-text">${eyebrow ? `<div class="sh-eyebrow">${esc(eyebrow)}</div>` : ''}<h2>${esc(title)}</h2></div>
    ${b}${more}
  </header>`;
}

/** Stat tile. Numbers count up on first paint (see app.js animateCounts). */
export function stat(value, label, { hero: isHero = false, color, sub } = {}) {
  const n = typeof value === 'number';
  return `<div class="stat-tile ${isHero ? 'hero' : ''}" ${color ? `style="--c:${esc(color)}"` : ''}>
    <div class="sv" ${n ? `data-count="${value}"` : ''}>${esc(value)}</div>
    <div class="sl">${esc(label)}</div>${sub ? `<div class="ss">${esc(sub)}</div>` : ''}
  </div>`;
}

export const chip = (text, color = 'var(--t3)') => `<span class="chip" style="--c:${esc(color)}">${esc(text)}</span>`;

export const empty = (text) => `<p class="empty">${esc(text)}</p>`;

/** Hexagon avatar in the kid's color. */
export const avatar = (k, size = '') => `<span class="avatar ${size}" style="--c:${esc(k.color)}" aria-hidden="true"><span>${k.art ? `<img src="${esc(k.art)}" alt="">` : esc(k.emoji)}</span></span>`;

/** Color dots for an item's `who`; family items get the brand green. */
export function whoDots(who, kids) {
  if (!who.length) return `<span class="dot" style="--c:var(--acc)" title="Family"></span>`;
  return who.map((id) => kids.find((k) => k.id === id)).filter(Boolean)
    .map((k) => `<span class="dot" style="--c:${esc(k.color)}" title="${esc(k.name)}"></span>`).join('');
}

/** Accent color for an item: one kid → her color, otherwise family green. */
export function whoColor(who, kids) {
  return who.length === 1 ? kids.find((k) => k.id === who[0])?.color || 'var(--acc)' : 'var(--acc)';
}

/** Choice-pill row. `current` is the active value, null = Everyone. */
export function kidFilter(kids, current, { all = true } = {}) {
  const pill = (val, label, color) =>
    `<button class="choice-pill ${current === val ? 'selected' : ''}" data-kid="${val ?? ''}" style="--c:${esc(color)}">${label}</button>`;
  return `<div class="pills" role="tablist">${all ? pill(null, 'Everyone', 'var(--acc)') : ''}${kids.map((k) => pill(k.id, `<span class="pdot"></span>${esc(k.name)}`, k.color)).join('')}</div>`;
}

/** Generic segmented choice pills: [[value, label]]. */
export function segmented(name, options, current) {
  return `<div class="pills seg" data-seg="${name}">${options.map(([v, l]) =>
    `<button class="choice-pill ${current === v ? 'selected' : ''}" data-val="${v}">${l}</button>`).join('')}</div>`;
}

/** SVG progress ring. */
export function ring(frac, color, size = 64, stroke = 7, inner = '') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<div class="ring" style="--c:${esc(color)};width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-fg" style="stroke-dasharray:${c};--off:${c * (1 - Math.min(1, frac))};--full:${c}"/></svg>
    <div class="ring-in">${inner}</div></div>`;
}

// ---- Toast ---------------------------------------------------------------------------------

let toastTimer;
export function toast(msg, color = 'var(--acc)') {
  const el = $('#toast');
  el.innerHTML = msg;
  el.style.setProperty('--c', color);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** A little coin that pops up from where the kid tapped. */
export function coinBurst(x, y, amount) {
  const el = document.createElement('div');
  el.className = 'coin-burst';
  el.textContent = `+${amount}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---- Modal sheet ---------------------------------------------------------------------------

let closeOpen = null; // the sheet on screen now, so opening another one cancels it cleanly

/** Bottom sheet. `onClose` runs once however it closes (✕, backdrop, idle, or a newer sheet). */
export function modal(html, { onMount, onClose } = {}) {
  closeOpen?.();
  const root = $('#modal');
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (closeOpen === close) closeOpen = null;
    root.classList.remove('open'); root.innerHTML = ''; root.onclick = null;
    onClose?.();
  };
  closeOpen = close;
  root.onclick = (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); };
  onMount?.(root.firstElementChild, close);
  return close;
}

// ---- Parent PIN ----------------------------------------------------------------------------
// Parent mode unlocks approvals, adjustments, and backup. It stays unlocked for a few minutes,
// then relocks on its own so a wall display never sits in parent mode.

let unlockedUntil = 0;
export const isParent = () => Date.now() < unlockedUntil;
export function lockParent() { unlockedUntil = 0; document.body.classList.remove('parent'); }

/** Resolves true once a parent has entered the PIN. `reset` asks for a new PIN (change PIN). */
export function requireParent({ reset = false } = {}) {
  if (isParent() && !reset) return Promise.resolve(true);
  const creating = reset || !store.pinHash;
  return new Promise((resolve) => {
    let entry = '';
    let first = null;
    let ok = false;
    const close = modal(`
      <h3 class="sheet-title">${reset ? 'New parent PIN' : creating ? 'Create a parent PIN' : 'Parent PIN'}</h3>
      <p class="sheet-sub" id="pin-sub">${creating ? 'Pick 4 digits. Kids won’t see it.' : 'Enter the 4-digit PIN.'}</p>
      <div class="pin-dots" id="pin-dots">${'<span></span>'.repeat(4)}</div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((n) => n === '' ? '<span></span>' : `<button data-n="${n}">${n}</button>`).join('')}</div>
      <button class="btn ghost wide" data-close>Cancel</button>`, {
      onMount(sheet) {
        const dots = () => [...sheet.querySelectorAll('#pin-dots span')].forEach((d, i) => d.classList.toggle('on', i < entry.length));
        sheet.querySelector('.pinpad').addEventListener('click', async (e) => {
          const n = e.target.closest('button')?.dataset.n;
          if (n == null) return;
          entry = n === '⌫' ? entry.slice(0, -1) : (entry + n).slice(0, 4);
          dots();
          if (entry.length < 4) return;
          const h = await hashPin(entry);
          if (creating && !first) { first = h; entry = ''; dots(); sheet.querySelector('#pin-sub').textContent = 'Once more to confirm.'; return; }
          if (creating ? h === first : h === store.pinHash) {
            if (creating) store.setPinHash(h);
            unlockedUntil = Date.now() + 5 * 60e3;
            document.body.classList.add('parent');
            ok = true; close();
          } else {
            sheet.querySelector('#pin-dots').classList.add('shake');
            setTimeout(() => sheet.querySelector('#pin-dots')?.classList.remove('shake'), 400);
            entry = ''; if (creating) { first = null; sheet.querySelector('#pin-sub').textContent = 'Didn’t match — pick 4 digits again.'; }
            dots();
          }
        });
      },
      onClose: () => resolve(ok),
    });
  });
}

/** Yes/no sheet. `danger` paints the confirm button red. */
export function confirmSheet(title, body, { ok = 'Yes', danger = false, icon = '' } = {}) {
  return new Promise((resolve) => {
    let yes = false;
    modal(`
      ${icon ? `<div class="sheet-icon">${icon}</div>` : ''}
      <h3 class="sheet-title">${esc(title)}</h3>
      <p class="sheet-sub">${body}</p>
      <button class="btn wide ${danger ? 'danger' : 'ok'}" data-yes>${esc(ok)}</button>
      <button class="btn ghost wide" data-close>Cancel</button>`, {
      onMount(sheet, close) {
        sheet.querySelector('[data-yes]').addEventListener('click', () => { yes = true; close(); });
      },
      onClose: () => resolve(yes),
    });
  });
}
