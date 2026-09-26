// One-time JSONBin setup: creates the "Ervin Central" collection with a Household bin and one bin
// per kid, then prints the device setup link.
//
//   JSONBIN_MASTER_KEY='...' JSONBIN_ACCESS_KEY='...' node scripts/setup-jsonbin.mjs
//
// The master key is used only here, on your Mac — it never goes into the site. The access key
// (Bins: Read + Update only) is what devices use; it rides in the setup link, not in the repo.
// Bin ids are saved to jsonbin/bins.local.json (gitignored) so you can rebuild the link later
// with:  JSONBIN_ACCESS_KEY='...' node scripts/setup-jsonbin.mjs --link
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const SITE = 'https://mattjervin.github.io/Ervin-Central/';
const LOCAL = new URL('jsonbin/bins.local.json', root);
const master = process.env.JSONBIN_MASTER_KEY;
const access = process.env.JSONBIN_ACCESS_KEY;

const family = JSON.parse(await readFile(new URL('data/family.json', root), 'utf8'));
const kids = family.kids.map((k) => k.id);

function linkFor(bins) {
  if (!access) return null;
  const code = Buffer.from(JSON.stringify({ accessKey: access, bins })).toString('base64url');
  return `${SITE}#/setup/${code}`;
}

async function api(path, headers, body) {
  const res = await fetch(`https://api.jsonbin.io/v3${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': master, ...headers },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json.message || ''}`);
  return json.metadata?.id || json.record?.id || json.id;
}

if (process.argv.includes('--link')) {
  const { bins } = JSON.parse(await readFile(LOCAL, 'utf8'));
  console.log(linkFor(bins) || 'Set JSONBIN_ACCESS_KEY to build the link.');
  process.exit(0);
}

if (!master) {
  console.error('Set JSONBIN_MASTER_KEY (JSONBin dashboard → API Keys → X-Master-Key).');
  process.exit(1);
}

const collection = await api('/c', { 'X-Collection-Name': 'Ervin Central' });
console.log(`Collection "Ervin Central": ${collection}`);

const bins = {};
const make = async (key, name, record) => {
  bins[key] = await api('/b', { 'X-Bin-Name': name, 'X-Collection-Id': collection, 'X-Bin-Private': 'true' }, record);
  console.log(`  ${name.padEnd(9)} ${bins[key]}`);
};
await make('household', 'Household', { v: 2, pinHash: null });
for (const k of family.kids) await make(k.id, k.name, { v: 2, kid: k.id, done: {}, ledger: [], pending: [] });

await writeFile(LOCAL, JSON.stringify({ collection, bins }, null, 2) + '\n');
console.log(`\nSaved ids to jsonbin/bins.local.json (not committed).`);

const link = linkFor(bins);
console.log(link
  ? `\nSetup link — open it on each family device (AirDrop / text it to yourself):\n\n${link}\n`
  : `\nNow create an Access Key (Bins: Read + Update) and run:\n  JSONBIN_ACCESS_KEY='...' node scripts/setup-jsonbin.mjs --link\n`);
