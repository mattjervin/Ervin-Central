// Plain `node --test` checks for the date logic the site leans on — no npm, no build.
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cfg, schoolDay, itemsOn, sleepOn, countdowns, ruleDate, holidaysIn, whatToWear, periodKey, houseNow, houses, choresFor, weeklyFor } from '../js/data.js';
import { applyOp, replay, houseOf } from '../js/store.js';
import { sunTimes, skyKind } from '../js/scene.js';
import { ymd } from '../js/util.js';

const json = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
Object.assign(cfg, {
  family: await json('family.json'), school: await json('school.json'), calendar: await json('calendar.json'),
  chores: await json('chores.json'), menus: { schools: {} }, wear: await json('wear.json'),
});
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

test('holidays keep coming in future years', () => {
  for (const y of [2027, 2028, 2029, 2030]) {
    const titles = holidaysIn(y).map((h) => h.title);
    for (const t of ['Thanksgiving', 'Christmas', 'Easter', 'Halloween', 'Hanukkah begins']) assert.ok(titles.includes(t), `${t} ${y}`);
  }
});

test('ADM school days: breaks, workdays, early outs', () => {
  assert.deepEqual(schoolDay('mv', d('2026-11-26')), { type: 'none', reason: 'Thanksgiving break', note: 'Thanksgiving break' });
  assert.equal(schoolDay('ae', d('2026-10-23')).type, 'none');
  assert.equal(schoolDay('ae', d('2027-03-17')).reason, 'Spring break');
  assert.equal(schoolDay('mv', d('2026-10-20')).type, 'early');
  assert.equal(schoolDay('mv', d('2026-10-20')).note, 'P/T conferences');
  assert.equal(schoolDay('mv', d('2026-10-02')).type, 'early');      // an ordinary Friday
  assert.equal(schoolDay('mv', d('2026-10-21')).type, 'full');
  assert.equal(schoolDay('mv', d('2027-05-27')).note, 'Last day of school');
  assert.equal(schoolDay('mv', d('2027-05-28')).reason, 'Summer break');
});

test('a break shows once as "first day" and not as school', () => {
  const first = itemsOn(d('2026-12-23')).find((x) => x.kind === 'noschool');
  const later = itemsOn(d('2026-12-28')).find((x) => x.kind === 'noschool');
  assert.equal(first.title, 'No school · Winter break');
  assert.equal(first.firstOfRun, true);
  assert.equal(later.firstOfRun, false);
  assert.ok(!itemsOn(d('2026-12-28')).some((x) => x.kind === 'school'));
  assert.ok(itemsOn(d('2026-11-26')).some((x) => x.kind === 'holiday' && x.title === 'Thanksgiving'));
  assert.equal(itemsOn(d('2026-10-20')).find((x) => x.kind === 'school').title, 'School · early out · P/T conferences');
});

test('sleep: weeknights fixed, weekends alternate from the anchor', () => {
  assert.equal(sleepOn(d('2026-09-28')).key, 'mom'); // Mon
  assert.equal(sleepOn(d('2026-09-29')).key, 'dad'); // Tue
  assert.equal(sleepOn(d('2026-09-25')).key, 'dad'); // anchor Fri
  assert.equal(sleepOn(d('2026-09-27')).key, 'dad'); // that Sun
  assert.equal(sleepOn(d('2026-10-03')).key, 'mom'); // next Sat
  assert.equal(sleepOn(d('2026-09-19')).key, 'mom'); // weekend before the anchor
  assert.equal(sleepOn(d('2027-03-13')).key, sleepOn(d('2027-03-12')).key); // across DST
});

test('countdowns: both girls pinned, each holiday once, soonest first', () => {
  const list = countdowns(d('2026-09-27'));
  assert.equal(list.length, 6);
  assert.equal(list.filter((c) => c.kid).length, 2);
  assert.equal(new Set(list.map((c) => c.title)).size, list.length);
  assert.deepEqual(list.map((c) => c.days), [...list.map((c) => c.days)].sort((a, b) => a - b));
});

test('sunrise/sunset follow the month', () => {
  const june = sunTimes(d('2026-06-15'), cfg.family.location.sun);
  const dec = sunTimes(d('2026-12-15'), cfg.family.location.sun);
  assert.ok(june.rise < 6 && june.set > 20.5);
  assert.ok(dec.rise > 7.4 && dec.set < 17);
  const late = sunTimes(d('2026-09-30'), cfg.family.location.sun); // blends toward October
  assert.ok(late.set < 19.3 && late.set > 18.5);
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

test('houses come from the sleep schedule; mornings belong to last night’s house', () => {
  assert.deepEqual(houses().map((h) => h.id), ['dad', 'mom']);
  assert.equal(houseNow(new Date('2026-09-29T20:00')), 'dad'); // Tue night: Dad's
  assert.equal(houseNow(new Date('2026-09-30T07:30')), 'dad'); // Wed morning: woke up at Dad's
  assert.equal(houseNow(new Date('2026-09-30T18:00')), 'mom'); // Wed evening: Mom's
});

test('chores.json: ids unique across lists, every kid has daily and weekly chores', () => {
  const all = [...cfg.chores.daily, ...cfg.chores.weekly, ...cfg.chores.extra].map((c) => c.id);
  assert.equal(new Set(all).size, all.length);
  for (const k of cfg.family.kids) {
    assert.ok(choresFor(k.id, d('2026-10-12')).length > 0);
    assert.ok(weeklyFor(k.id).length > 0);
  }
  assert.ok(cfg.family.passcodes.dad && cfg.family.passcodes.mom && !cfg.family.passcodes.parent);
});

test('school-only recurring items skip breaks', () => {
  const pe = (s) => itemsOn(d(s)).some((x) => x.title === 'Avery PE Day');
  assert.equal(pe('2026-11-23'), true);  // Mon, school
  assert.equal(pe('2026-11-25'), false); // Wed, Thanksgiving break
  assert.equal(pe('2027-03-15'), false); // spring break
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
