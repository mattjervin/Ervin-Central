// Publish the family's data from the private repo (private/data/*.json) to Supabase, where the site
// reads it (ervin_central.config). Only devices with their own key get it; everyone else gets the
// Grandparents Central slice. Unchanged files are skipped; every change is kept in config_history.
//   node scripts/publish.mjs            # all five files
//   node scripts/publish.mjs calendar   # just one
// No version bump or git push of the public site is needed for data changes — open apps pick them
// up the next time they're opened (or with ↻).

import { readFile } from 'node:fs/promises';
import { adminToken, privateData, rpc } from './admin.mjs';

const NAMES = ['family', 'calendar', 'chores', 'school', 'menus'];
const want = process.argv.slice(2);
for (const n of want) if (!NAMES.includes(n)) { console.error(`Unknown file "${n}" — one of ${NAMES.join(', ')}`); process.exit(1); }

const token = adminToken();
for (const name of want.length ? want : NAMES) {
  const data = JSON.parse(await readFile(new URL(`${name}.json`, privateData), 'utf8'));
  if (name === 'family' && data.sync) throw new Error('family.json has a sync block — that belongs in the public data/site.json');
  console.log(`${name.padEnd(9)} ${await rpc('ec_publish', { p_admin: token, p_name: name, p_data: data })}`);
}
