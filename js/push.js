// Notifications for parents: when a kid asks for an OK (an extra chore or a reward), the parent of
// that house gets a push on the devices where they turned it on (Parent management → Notifications).
//
// Web Push, no app to install. On iPhone it only works from the home-screen app (iOS 16.4+). The
// subscription is stored in Supabase through rpc functions behind this device's key (the table itself
// isn't readable); the database trigger and the Edge Function do the sending — see
// supabase/ervin_central.sql.

import { rpc, siteSync } from './cloud.js';

const KEY = 'ervin-central:push'; // { endpoint, house } — this device's subscription, if any

const local = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad Safari in a tab (not the home-screen app) — push needs the home-screen app there. */
export const needsHomeScreen = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;

/** Register the service worker (notifications only — it doesn't cache). Safe to call on every boot. */
export async function registerWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('sw.js'); } catch { return null; }
}

const b64urlBytes = (s) => {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Where this device stands: { state: 'unsupported' | 'homescreen' | 'denied' | 'off' | 'on', house }.
 * 'on' is checked against the server, so a subscription the push service dropped shows as off.
 */
export async function pushStatus() {
  if (!pushSupported()) return { state: needsHomeScreen() ? 'homescreen' : 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) { save(null); return { state: 'off' }; }
  let house = local()?.house || null;
  try { house = await rpc('ec_push_house', { p_endpoint: sub.endpoint }); } catch { /* offline: trust the local copy */ }
  return house ? { state: 'on', house } : { state: 'off' };
}

/** Turn notifications on for `house` ('dad' | 'mom'). Must run from a tap (iOS asks for permission). */
export async function enablePush(house, deviceName) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications weren’t allowed');
  await registerWorker();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlBytes(siteSync().vapidPublicKey) }));
  const { keys } = sub.toJSON();
  await rpc('ec_push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_house: house, p_device_name: deviceName || null });
  save({ endpoint: sub.endpoint, house });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await rpc('ec_push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  save(null);
}

/** Ask the server to send this device a test notification. */
export async function testPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) throw new Error('Notifications are off on this device');
  if (!(await rpc('ec_push_test', { p_endpoint: sub.endpoint }))) throw new Error('This device isn’t signed up — turn notifications on again');
}
