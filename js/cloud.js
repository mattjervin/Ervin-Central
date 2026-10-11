// The one door to Supabase: rpc calls (POST /rest/v1/rpc/<fn>) with this device's key.
//
// The family's data isn't in the public repo. Each family device holds its own random key
// (localStorage 'ervin-central:key'); the ec_* functions check it and answer with the family's data,
// or — with no key — only Grandparents Central's slice. A device gets its key once: carried over
// automatically if it was already in use before the lock, or set up with a parent's or the kids'
// code (js/views/lock.js). Revoking a device is scripts/devices.mjs on Matt's Mac.

const KEY = 'ervin-central:key';

let site = null; // data/site.json → sync: { url, key, schema, pollSeconds, vapidPublicKey }

export function setSite(sync) { site = sync?.url && sync?.key ? { ...sync, url: sync.url.replace(/\/$/, ''), schema: sync.schema || 'public' } : null; }
export const siteSync = () => site;

export function deviceKey() { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setDeviceKey(k) { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch { /* private mode */ } }

/** Call ervin_central.<fn>. `p_key` (this device's key) is added unless `withKey` is false. */
export async function rpc(fn, body = {}, { withKey = true } = {}) {
  if (!site) throw new Error('No cloud settings (data/site.json → sync)');
  const res = await fetch(`${site.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: site.key, 'Content-Profile': site.schema, 'Content-Type': 'application/json' },
    body: JSON.stringify(withKey ? { p_key: deviceKey(), ...body } : body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* not json */ }
    const err = new Error(`Cloud ${fn} failed (${res.status})${msg ? ': ' + String(msg).slice(0, 120) : ''}`);
    err.status = res.status;
    err.fatal = res.status === 401 || res.status === 403 || res.status === 404; // retrying won't help
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

let version = '';
/** The site version this page runs (app.js ?v=), sent along so Matt can see which devices updated. */
export const setVersion = (v) => { version = v || ''; };
export const appVersion = () => version;
