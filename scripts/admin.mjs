// Shared bits for the Mac-side admin scripts (publish.mjs, devices.mjs): the Supabase address from
// data/site.json and the admin token from the macOS keychain (item "ervin-central-admin"). The token
// is never written to disk or the repo; the database only knows its SHA-256.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export const root = new URL('../', import.meta.url);
export const privateData = new URL('private/data/', root);

const site = JSON.parse(await readFile(new URL('data/site.json', root), 'utf8')).sync;

export function adminToken() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'ervin-central-admin', '-w'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('No admin token in the keychain (item "ervin-central-admin") — see private/README.md');
  }
}

export async function rpc(fn, body) {
  const res = await fetch(`${site.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: site.key, 'Content-Profile': site.schema, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
