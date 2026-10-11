// Plain `node --test` checks for the logic the site leans on — no npm, no build. The checks that
// need the family's data live in the private repo (private/tests/), so run both:
//   node --test 'tests/*.test.mjs' 'private/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cfg, ruleDate, whatToWear, periodKey } from '../js/data.js';
import { applyOp, replay, houseOf } from '../js/store.js';
import { skyKind } from '../js/scene.js';
import { ymd } from '../js/util.js';

// Only data/site.json and data/wear.json are public; the family's data is in the private repo.
const pub = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
Object.assign(cfg, { scope: 'family', site: await pub('site.json'), wear: await pub('wear.json') });
const d = (s) => new Date(`${s}T12:00`);

test('holiday rules land on the right days', () => {
  const at = (rule, y) => ymd(ruleDate(rule, y));
  assert.equal(at('4th-thu-11', 2026), '2026-11-26');
  assert.equal(at('4th-thu-11', 2027), '2027-11-25');
  assert.equal(at('last-mon-05', 2027), '2027-05-31');
  assert.equal(at('3rd-mon-01', 2027), '2027-01-18');
  assert.equal(at('2nd-sun-05', 2028), '2028-05-14');
  assert.equal(at('easter', 2027), '2027-03-28');
  assert.equal(at('easter', 2028), '2028-04-16');
  assert.equal(at('easter', 2030), '2030-04-21');
  assert.equal(at('election', 2026), '2026-11-03');
  assert.equal(at('election', 2027), '2027-11-02');
  assert.equal(at('01-01', 2029), '2029-01-01');
});

test('weather codes map to sky kinds', () => {
  assert.equal(skyKind(0), 'clear');
  assert.equal(skyKind(2), 'partly');
  assert.equal(skyKind(3), 'cloudy');
  assert.equal(skyKind(45), 'fog');
  assert.equal(skyKind(61), 'rain');
  assert.equal(skyKind(81), 'rain');
  assert.equal(skyKind(73), 'snow');
  assert.equal(skyKind(95), 'storm');
});

test('store ops are idempotent (the outbox replays them)', () => {
  const doc = { v: 2, kid: 'avery', done: {}, ledger: [], pending: [] };
  const date = ymd(new Date());
  const on = { t: 'chore', date, choreId: 'make-bed', on: true, ts: 1, ref: `${date}:make-bed:avery`,
    entry: { id: 'e1', kid: 'avery', amount: 1, reason: 'Make your bed', type: 'chore', ref: `${date}:make-bed:avery`, ts: 1 } };
  applyOp(doc, on); applyOp(doc, on);
  assert.equal(doc.ledger.length, 1);
  const req = { t: 'request', item: { id: 'p1', kid: 'avery', type: 'bonus', ref: 'vacuum', title: 'Vacuum', amount: 2, ts: 2 } };
  applyOp(doc, req); applyOp(doc, req);
  assert.equal(doc.pending.length, 1);
  const ok = { t: 'approve', id: 'p1', entryId: 'e2', ts: 3 };
  applyOp(doc, ok); applyOp(doc, ok);
  assert.equal(doc.ledger.length, 2);
  const zero = { t: 'zero', id: 'z1', reason: 'Cashed in', ts: 4 };
  applyOp(doc, zero); applyOp(doc, zero);
  assert.equal(doc.ledger.reduce((s, e) => s + e.amount, 0), 0);
  assert.equal(doc.ledger.length, 3);
});

const blank = () => ({ v: 2, kid: 'avery', done: {}, ledger: [], pending: [] });
const tick = (id, on = true) => {
  const date = ymd(new Date()), ref = `${date}:${id}:avery`;
  return { t: 'chore', date, choreId: id, on, ts: 1, ref, entry: { id: `e-${id}`, kid: 'avery', amount: 1, reason: id, type: 'chore', ref, ts: 1 } };
};

test('cloud log: replaying in seq order rebuilds the same balances on every device', () => {
  const log = [
    { seq: 1, bin: 'avery', op: tick('bed') },
    { seq: 2, bin: 'avery', op: { t: 'request', item: { id: 'p1', kid: 'avery', type: 'bonus', ref: 'vacuum', title: 'Vacuum', amount: 2, ts: 2 } } },
    { seq: 3, bin: 'avery', op: { t: 'approve', id: 'p1', entryId: 'e2', ts: 3 } },
    { seq: 4, bin: 'test', op: { t: 'noop' } },                       // unknown bins are ignored
    { seq: 5, bin: 'avery', op: { t: 'zero', id: 'z1', reason: 'Cashed in', ts: 4 } },
    { seq: 6, bin: 'avery', op: tick('teeth') },
  ];
  const a = replay({ avery: blank() }, log);
  const b = replay({ avery: blank() }, [...log].reverse()); // rows arriving out of order
  assert.deepEqual(a, b);
  assert.equal(a.avery.ledger.reduce((s, e) => s + e.amount, 0), 1); // zeroed, then one more chore
  assert.equal(a.avery.pending.length, 0);
});

test('cloud log: a duplicated op (a retry) never pays twice', () => {
  const log = [{ seq: 1, bin: 'avery', op: tick('bed') }, { seq: 2, bin: 'avery', op: tick('bed') }];
  assert.equal(replay({ avery: blank() }, log).avery.ledger.length, 1);
});

test('cloud log: the one-time migration merge is idempotent', () => {
  const old = blank();
  applyOp(old, tick('bed')); applyOp(old, tick('teeth'));
  const merge = { t: 'merge', ledger: old.ledger, pending: old.pending, done: old.done };
  // Two devices both migrate the same old gist copy: still two coins.
  const doc = replay({ avery: blank() }, [{ seq: 1, bin: 'avery', op: merge }, { seq: 2, bin: 'avery', op: merge }]);
  assert.equal(doc.avery.ledger.length, 2);
});

const jar = (doc, h) => doc.ledger.filter((e) => houseOf(e) === h).reduce((s, e) => s + e.amount, 0);

test('houses: each girl has a jar per house, and zero empties only one', () => {
  const doc = blank();
  const pay = (id, house, amount, ref) => ({ t: 'entry', entry: { id, kid: 'avery', house, amount, reason: id, type: 'adjust', ref, ts: 1 } });
  applyOp(doc, pay('a', 'dad', 5)); applyOp(doc, pay('b', 'mom', 3));
  applyOp(doc, { t: 'entry', entry: { id: 'old', kid: 'avery', amount: 2, reason: 'before houses', ts: 0 } }); // legacy → Dad's
  assert.equal(jar(doc, 'dad'), 7);
  assert.equal(jar(doc, 'mom'), 3);
  applyOp(doc, { t: 'zero', id: 'z', house: 'mom', reason: 'Cashed in', ts: 2 });
  assert.equal(jar(doc, 'mom'), 0);
  assert.equal(jar(doc, 'dad'), 7);
  // A parent-given extra (kindness catch) carries a dated ref: once a day, even with a fresh entry id.
  applyOp(doc, pay('k1', 'dad', 1, '2026-10-10:kind-catch:avery'));
  applyOp(doc, pay('k2', 'mom', 1, '2026-10-10:kind-catch:avery'));
  assert.equal(jar(doc, 'dad'), 8);
  assert.equal(jar(doc, 'mom'), 0);
});

test('extras: once a day per girl, and approval pays into the asking house', () => {
  const ask = (id, house) => ({ t: 'request', item: { id, kid: 'avery', house, type: 'bonus', ref: '2026-10-10:rake:avery', choreId: 'rake', limited: true, title: 'Rake', amount: 2, ts: 1 } });
  const log = [
    { seq: 1, bin: 'avery', op: ask('p1', 'mom') },
    { seq: 2, bin: 'avery', op: ask('p2', 'dad') },                       // already waiting → ignored
    { seq: 3, bin: 'avery', op: { t: 'approve', id: 'p1', entryId: 'e1', ts: 2 } },
    { seq: 4, bin: 'avery', op: ask('p3', 'dad') },                       // already paid today → ignored
  ];
  const doc = replay({ avery: blank() }, log).avery;
  assert.equal(doc.pending.length, 0);
  assert.equal(jar(doc, 'mom'), 2);
  assert.equal(jar(doc, 'dad'), 0);
  // A declined ask can be sent again the same day.
  const again = replay({ avery: blank() }, [log[0], { seq: 2, bin: 'avery', op: { t: 'decline', id: 'p1' } }, { seq: 3, bin: 'avery', op: ask('p4', 'dad') }]).avery;
  assert.equal(again.pending.length, 1);
});

test('chore periods: daily by day, weekly by its Monday (counted across both houses)', () => {
  assert.equal(periodKey('daily', d('2026-10-10')), '2026-10-10');
  assert.equal(periodKey('weekly', d('2026-10-10')), '2026-10-05'); // Sat → Mon
  assert.equal(periodKey('weekly', d('2026-10-11')), '2026-10-05'); // Sun is the same week
  assert.equal(periodKey('weekly', d('2026-10-12')), '2026-10-12'); // Mon starts a new one
  // Ticking a weekly chore at Mom's and then at Dad's in the same week is still one tick.
  const wk = (house, id) => ({ t: 'chore', date: '2026-10-05', choreId: 'vacuum', on: true, ts: 1, ref: '2026-10-05:vacuum:avery',
    entry: { id, kid: 'avery', house, amount: 3, reason: 'Vacuum', type: 'chore', ref: '2026-10-05:vacuum:avery', ts: 1 } });
  const doc = replay({ avery: blank() }, [{ seq: 1, bin: 'avery', op: wk('mom', 'a') }, { seq: 2, bin: 'avery', op: wk('dad', 'b') }]).avery;
  assert.equal(doc.ledger.length, 1);
  assert.equal(jar(doc, 'mom'), 3);
});

test('what to wear follows the feels-like temps, rain and snow', () => {
  const wear = (day) => whatToWear(day).map((r) => r.text);
  assert.deepEqual(wear({ feelsHi: 84, feelsLo: 66, rain: 10, code: 1, wind: 5 }), ['T-shirt', 'Shorts or a skirt']);
  assert.deepEqual(wear({ feelsHi: 88, feelsLo: 70, rain: 0, code: 0 }), ['T-shirt', 'Shorts or a skirt', 'Sunscreen & a hat']);
  assert.ok(wear({ feelsHi: 68, feelsLo: 50, rain: 10, code: 2 }).includes('Light jacket — take it off later'));
  assert.ok(wear({ feelsHi: 60, feelsLo: 52, rain: 70, code: 61 }).includes('Rain jacket'));
  const winter = wear({ feelsHi: 25, feelsLo: 10, rain: 60, code: 73 });
  assert.ok(winter.includes('Winter coat, hat & gloves') && winter.includes('Snow boots & snow pants') && winter.includes('Sweater or sweatshirt'));
  assert.ok(!winter.includes('Rain jacket'));
  // The girls run cold: an overcast 60s-to-low-70s day is pants and sleeves; the same temps in sun allow shorts.
  assert.deepEqual(wear({ feelsHi: 74, feelsLo: 62, rain: 10, code: 3 }), ['Long sleeves', 'Pants or leggings']);
  assert.deepEqual(wear({ feelsHi: 74, feelsLo: 62, rain: 10, code: 1 }), ['T-shirt', 'Shorts or a skirt']);
  assert.deepEqual(wear({ feelsHi: 71, feelsLo: 62, rain: 0, code: 0 }), ['T-shirt', 'Pants or leggings']);
});

test('version.json matches the ?v= on app.js and app.css in index.html', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const { v } = JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8'));
  assert.equal(html.match(/js\/app\.js\?v=([^"]+)"/)?.[1], String(v));
  assert.equal(html.match(/css\/app\.css\?v=([^"]+)"/)?.[1], String(v));
});

test('Grandparents share link survives a refreshed app (?r=…) and points at the plain path', async () => {
  const { shareUrl } = await import('../js/views/grandparents.js');
  const want = 'https://mattjervin.github.io/Ervin-Central/grandparents/';
  assert.equal(shareUrl('https://mattjervin.github.io/Ervin-Central/?r=1791733774871#/grandparents'), want);
  assert.equal(shareUrl('https://mattjervin.github.io/Ervin-Central/#/grandparents'), want);
  assert.equal(shareUrl('https://mattjervin.github.io/Ervin-Central/index.html#/grandparents'), want);
});

test('Notifications: public key only in the repo; the service worker never caches', async () => {
  const root = new URL('../', import.meta.url);
  assert.match(cfg.site.sync.vapidPublicKey, /^B[A-Za-z0-9_-]{86}$/);
  const fn = await readFile(new URL('supabase/functions/ervin-central-push/index.ts', root), 'utf8');
  assert.ok(fn.includes(cfg.site.sync.vapidPublicKey), 'Edge Function relays only for our key');
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  assert.ok(!/addEventListener\('fetch'/.test(sw), 'service worker must not intercept fetches (auto-update relies on the network)');
});

test('The public repo holds no family data: data/ has only site.json, wear.json and empty stubs', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../data/', import.meta.url);
  const STUBS = ['calendar.json', 'chores.json', 'family.json', 'menus.json', 'school.json'];
  assert.deepEqual((await readdir(dir)).filter((f) => !f.startsWith('.')).sort(), [...STUBS, 'site.json', 'wear.json'].sort());
  for (const f of STUBS) {
    const j = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
    assert.match(j._help, /^Retired 2026-10-11/, `${f} must stay an empty stub (old cached apps only need it to start and update)`);
    for (const k of ['events', 'recurring', 'birthdays', 'daily', 'weekly', 'extra', 'rewards', 'noSchool']) {
      const v = j[k] ?? j.year?.[k];
      if (v) assert.equal(v.length, 0, `${f} → ${k} must be empty`);
    }
    assert.ok(!('sleep' in j) && !('passcodes' in j && Object.keys(j.passcodes).length), `${f}: no sleep schedule or passcodes`);
    if (f === 'school.json') assert.deepEqual(Object.keys(j.schools), ['x'], 'only the placeholder school');
    if (f === 'menus.json') assert.deepEqual(j.schools, {}, 'no cached menus');
    for (const k of j.kids || []) assert.deepEqual(Object.keys(k).filter((x) => !['id', 'name', 'emoji', 'color', 'school', 'art'].includes(x)), [], `${f}: kids carry only what Grandparents Central shows`);
  }
});
