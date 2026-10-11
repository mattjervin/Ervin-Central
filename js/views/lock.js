// What a device without its key sees instead of the family pages: a way to set it up (a parent's
// code or the kids' coin code, checked on the server) and the way to Grandparents Central, which
// stays open to anyone with the link. Phones that were already in use before the lock never see
// this: carryOver() gets them their key on the first open (see ec_carry_over in the SQL).

import { rpc, setDeviceKey, appVersion } from '../cloud.js';
import { store } from '../store.js';
import { card, hero, passcodeSheet } from '../ui.js';

export const title = 'Ervin Central';

const meHint = () => {
  try { return new URLSearchParams(location.search).get('me') || localStorage.getItem('ervin-central:me'); } catch { return null; }
};

/** Coin-entry ids this device already holds from the log — proof it was syncing before the lock. */
function proof() {
  try {
    const cache = JSON.parse(localStorage.getItem('ervin-central:cloud'));
    return Object.values(cache?.docs || {}).flatMap((d) => d.ledger || [])
      .filter((e) => e.id && e.type !== 'reset').sort((a, b) => b.ts - a.ts).slice(0, 10).map((e) => String(e.id));
  } catch { return []; }
}

/** A device that was in use before the lock gets its key without anyone typing anything. */
export async function carryOver() {
  try {
    const r = await rpc('ec_carry_over', {
      p_device: store.status.device, p_proof: proof(), p_device_name: store.deviceName, p_me: meHint(), p_version: appVersion() || null,
    }, { withKey: false });
    if (r?.ok && r.key) { setDeviceKey(r.key); return true; }
  } catch { /* offline — the lock page has the way in */ }
  return false;
}

export function render() {
  return `
  ${hero('Family HQ', 'Ervin', 'Central', 'This page is for the family’s own phones.')}
  ${card(`
    <div class="lock-card">
      <div class="lock-icon" aria-hidden="true">🔒</div>
      <h2 class="lock-title">Set up this phone</h2>
      <p class="muted">Dad or Mom types their code — or type the coin code. You only do this once on each phone.</p>
      <button class="btn ok wide" data-setup>Set up this phone</button>
    </div>`, '', 1)}
  ${card(`
    <a class="lock-gp" href="#/grandparents">
      <span class="lock-gp-i" aria-hidden="true">👵👴</span>
      <span><b>Grandparents Central</b><small>The girls’ games, shows and birthdays</small></span>
      <span aria-hidden="true">→</span>
    </a>`, '', 2)}`;
}

export function mount(root) {
  root.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-setup]')) return;
    const who = await passcodeSheet({
      title: 'Set up this phone',
      sub: 'Dad’s code, Mom’s code or the coin code.',
      icon: '🔒',
      async check(pin) {
        const r = await rpc('ec_enroll', {
          p_device: store.status.device, p_pin: pin, p_device_name: store.deviceName, p_me: meHint(), p_version: appVersion() || null,
        }, { withKey: false });
        if (r?.ok && r.key) { setDeviceKey(r.key); return { ok: r.who }; }
        return { error: r?.error === 'wait' ? 'Too many tries — wait 15 minutes, then try again.' : 'Not quite — try again.' };
      },
    });
    if (who) location.reload(); // opens with the family's data
  });
}
