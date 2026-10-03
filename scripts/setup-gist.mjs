// One-time sync setup: creates the family's secret GitHub Gist (household.json + one file per
// kid, seeded from gist/*.json), then prints the device setup link.
//
//   GIST_TOKEN='github_pat_...' node scripts/setup-gist.mjs
//
// The gist is created with your own `gh` login, here on your Mac. GIST_TOKEN is the token the
// devices use: a fine-grained token with only "Gists: Read and write" (no repo access), so a
// leaked setup link can't touch the site. It rides in the setup link — never in the repo.
// The gist id is saved to gist/gist.local.json (gitignored); rebuild the link later with:
//   GIST_TOKEN='...' node scripts/setup-gist.mjs --link
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const SITE = 'https://mattjervin.github.io/Ervin-Central/';
const LOCAL = new URL('gist/gist.local.json', root);
const token = process.env.GIST_TOKEN;

const family = JSON.parse(await readFile(new URL('data/family.json', root), 'utf8'));
const bins = ['household', ...family.kids.map((k) => k.id)];

function linkFor(gistId) {
  if (!token) return null;
  const code = Buffer.from(JSON.stringify({ token, gistId })).toString('base64url');
  return `${SITE}#/setup/${code}`;
}

async function check(gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GIST_TOKEN can't read the gist (${res.status}) — it needs Gists: Read and write`);
}

const done = async (gistId) => {
  if (token) await check(gistId);
  const link = linkFor(gistId);
  console.log(link
    ? `\nSetup link — open it on each family device (AirDrop / text it to yourself):\n\n${link}\n`
    : `\nNow create a fine-grained token (Account permissions → Gists: Read and write) and run:\n  GIST_TOKEN='...' node scripts/setup-gist.mjs --link\n`);
};

if (process.argv.includes('--link')) {
  const { gistId } = JSON.parse(await readFile(LOCAL, 'utf8'));
  await done(gistId);
  process.exit(0);
}

try {
  const { gistId } = JSON.parse(await readFile(LOCAL, 'utf8'));
  console.error(`A gist already exists (${gistId}). Use --link, or delete gist/gist.local.json to start over.`);
  process.exit(1);
} catch { /* none yet */ }

const files = {};
for (const b of bins) files[`${b}.json`] = { content: await readFile(new URL(`gist/${b}.json`, root), 'utf8') };
const out = execFileSync('gh', ['api', '-X', 'POST', '/gists', '--input', '-'], {
  input: JSON.stringify({ description: 'Ervin Central — chores & Kindness Coins (synced by the site)', public: false, files }),
});
const gistId = JSON.parse(out).id;
console.log(`Created secret gist ${gistId}`);
await writeFile(LOCAL, JSON.stringify({ gistId }, null, 2) + '\n');
console.log('Saved the id to gist/gist.local.json (not committed).');
await done(gistId);
