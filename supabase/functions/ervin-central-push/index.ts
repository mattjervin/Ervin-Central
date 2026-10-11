// Ervin Central → Web Push relay (Supabase Edge Function "ervin-central-push", verify_jwt off).
//
// The database does the deciding: when a kid asks for a parent's OK (an `ops` row with t = 'request'),
// the trigger ervin_central.notify_request() picks that house's subscribed devices and POSTs them here
// with the message and the VAPID keys (kept in ervin_central.push_config, never in the repo). This
// function only encrypts and sends. It refuses any VAPID identity but ours, so it can't be used as a
// general relay. Subscriptions the push service says are gone (404/410) are reported back through
// rpc/push_gone so they stop being tried.
//
// Deploy: Supabase MCP deploy_edge_function (name ervin-central-push, verify_jwt false) or
//   supabase functions deploy ervin-central-push --no-verify-jwt

import webpush from 'npm:web-push@3.6.7';

const PUBLIC_KEY = 'BMCNSLMnrQZSX_dEYe_D-SwlfgC0nxsIT4czQCV63KXZX7QSf6hnSbBJ1M8FH4FmNrzV_9OEaxLNRzItmNTqs_U';
const PROJECT = 'https://gflocxcogragbwjplwgt.supabase.co';
const PUBLISHABLE = 'sb_publishable_JSzTVUs3AyUFBI5wmTmUpA_meMYDSIr'; // public-safe, same as data/family.json

type Sub = { endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: { vapid?: { publicKey?: string; privateKey?: string; subject?: string }; subs?: Sub[]; payload?: unknown; token?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { vapid, subs, payload, token } = body;
  if (vapid?.publicKey !== PUBLIC_KEY || !vapid.privateKey || !Array.isArray(subs)) return json({ error: 'not ours' }, 403);

  webpush.setVapidDetails(vapid.subject || 'https://mattjervin.github.io/Ervin-Central/', vapid.publicKey, vapid.privateKey);
  const gone: string[] = [];
  const failed: string[] = [];
  let sent = 0;
  await Promise.all(subs.slice(0, 20).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload ?? {}), { TTL: 24 * 3600, urgency: 'high' });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint);
      else failed.push(`${code ?? '?'} ${String((err as Error).message).slice(0, 120)}`);
    }
  }));

  if (gone.length && token) {
    await fetch(`${PROJECT}/rest/v1/rpc/push_gone`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE, 'Content-Profile': 'ervin_central', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token, p_endpoints: gone }),
    }).catch(() => {});
  }
  if (failed.length) console.error('push failures', failed);
  return json({ sent, gone: gone.length, failed });
});
