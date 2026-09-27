// Caches every published breakfast/lunch menu (LINQ usually posts ~2 months ahead) for the lunch.source school into
// data/menus.json. Run weekly from Matt's Mac by the calendar sync task (LINQ 403s GitHub runners) so the site still has menus if the
// live LINQ call ever fails from a kid's iPad. Usage: node scripts/fetch-menus.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fetchMenu } from '../js/linq.js';

const root = new URL('../', import.meta.url);
const school = JSON.parse(await readFile(new URL('data/school.json', root), 'utf8'));

const iso = (d) => d.toISOString().slice(0, 10);
const start = new Date();
start.setDate(start.getDate() - 3);
const end = new Date();
end.setDate(end.getDate() + 90);

// LINQ's WAF rejects requests that don't look like a browser.
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Accept: 'application/json',
};

const out = { updated: new Date().toISOString(), schools: {} };
// Both elementaries serve the same menu, so only the school the site reads (lunch.source) is cached.
for (const [key, s] of Object.entries(school.schools).filter(([k]) => k === school.lunch.source)) {
  out.schools[key] = await fetchMenu({
    districtId: school.district.linq.districtId,
    buildingId: s.buildingId,
    start: iso(start),
    end: iso(end),
    headers,
  });
  console.log(`${s.short}: ${Object.keys(out.schools[key]).length} days`);
}

await writeFile(new URL('data/menus.json', root), JSON.stringify(out, null, 1) + '\n');
