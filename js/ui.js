// Web ports of ErvOS's building blocks (CardBox, SectionHeader, StatTile, TagChip, EmptyNote)
// plus the touch-only pieces a wall display needs: a modal sheet, a toast, a PIN pad.

import { $, esc } from './util.js';
import { store, hashPin } from './store.js';

export const card = (body, cls = '') => `<section class="card ${cls}">${body}</section>`;

/** Colored marker + uppercase title + optional badge — ErvOS's SectionHeader. */
export function header(title, { color = 'var(--acc)', badge, badgeColor, href } = {}) {
  const b = badge != null ? `<span class="badge" style="--c:${badgeColor || color}">${esc(badge)}</span>` : '';
  const t = href ? `<a class="sh-link" href="${href}">${esc(title)} <span aria-hidden="true">›</span></a>` : esc(title);
  return `<header class="sh"><span class="sh-mark" style="background:${color}"></span><h2>${t}</h2>${b}</header>`;
}

export const stat = (value, label, color) =>
  `<div class="stat"><div class="stat-v" ${color ? `style="color:${color}"` : ''}>${esc(value)}</div><div class="stat-l">${esc(label)}</div></div>`;

export const chip = (text, color = 'var(--t3)') => `<span class="chip" style="--c:${color}">${esc(text)}</span>`;

export const empty = (text) => `<p class="empty">${esc(text)}</p>`;

export const avatar = (k, size = '') => `<span class="avatar ${size}" style="--c:${k.color}" aria-hidden="true">${esc(k.emoji)}</span>`;

/** "Evelynn · Avery" dots for an item's `who`; family items get the accent. */
export function whoDots(who, kids) {
  if (!who.length) return `<span class="dot" style="--c:var(--acc)" title="Family"></span>`;
  return who.map((id) => kids.find((k) => k.id === id)).filter(Boolean)
    .map((k) => `<span class="dot" style="--c:${k.color}" title="${esc(k.name)}"></span>`).join('');
}

/** Pill filter row. `current` is the active value, null = All. */
export function kidFilter(kids, current, { all = true } = {}) {
  const pill = (val, label, color) =>
    `<button class="pill ${current === val ? 'on' : ''}" data-kid="${val ?? ''}" style="--c:${color}">${label}</button>`;
  return `<div class="pills" role="tablist">${all ? pill(null, 'Everyone', 'var(--acc)') : ''}${kids.map((k) => pill(k.id, `${esc(k.emoji)} ${esc(k.name)}`, k.color)).join('')}</div>`;
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

export function modal(html, { onMount } = {}) {
  const root = $('#modal');
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  const close = () => { root.classList.remove('open'); root.innerHTML = ''; };
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

export function requireParent() {
  if (isParent()) return Promise.resolve(true);
  const creating = !store.state.settings.pinHash;
  return new Promise((resolve) => {
    let entry = '';
    let first = null;
    const close = modal(`
      <h3 class="sheet-title">${creating ? 'Create a parent PIN' : 'Parent PIN'}</h3>
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
          if (creating ? h === first : h === store.state.settings.pinHash) {
            if (creating) store.setPinHash(h);
            unlockedUntil = Date.now() + 5 * 60e3;
            document.body.classList.add('parent');
            close(); resolve(true);
          } else {
            sheet.querySelector('#pin-dots').classList.add('shake');
            setTimeout(() => sheet.querySelector('#pin-dots')?.classList.remove('shake'), 400);
            entry = ''; if (creating) { first = null; sheet.querySelector('#pin-sub').textContent = 'Didn’t match — pick 4 digits again.'; }
            dots();
          }
        });
      },
    });
    $('#modal').addEventListener('click', function once(e) {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) { $('#modal').removeEventListener('click', once); resolve(false); }
    });
  });
}
