// Home — phone first. A short live landscape carries the greeting, clock and weather; right under it
// is Today: each girl's day (school hours, specials, activities with a countdown to the next one,
// lunch) and a peek at tomorrow. Then where the girls sleep, what's coming up, a 4-day forecast,
// countdowns, and — last, since chores aren't the point — the coin leaderboard and chore chart.

import { cfg, kids, itemsOn, choresFor, menuRange, weather, lastWeather, schoolDay, schoolOf, sleepOn, nextSwitch, countdowns } from '../data.js';
import { store } from '../store.js';
import { card, header, empty, avatar, whoDots, whoColor, chip, ring, coinBurst } from '../ui.js';
import { sceneSvg, sunTimes, skyLabel } from '../scene.js';
import { esc, greeting, clock, ymd, relDay, plural, dayPart, addDays, parseYmd, DOW, DOW3, MONTH } from '../util.js';

export const title = 'Home';

export function render() {
  const now = new Date();
  const today = ymd(now);
  const ks = kids();
  const choreStats = ks.map((k) => {
    const list = choresFor(k.id, now);
    const done = list.filter((c) => store.isDone(today, c.id, k.id)).length;
    return { k, list, done, left: list.length - done };
  });

  return `
  <section class="home-hero anim-fade-up" id="scene">
    ${sceneSvg(now, sceneOpts())}
    <div class="hh-overlay">
      <div class="hh-greet">
        <div class="eyebrow">${esc(`${DOW[now.getDay()]} · ${MONTH[now.getMonth()].slice(0, 3)} ${now.getDate()}`)}</div>
        <h1 class="headline">${esc(greeting(now))},<br><em>${esc(cfg.family.family)}s</em></h1>
      </div>
      <div class="hh-now">
        <div class="big-clock" data-clock="long"></div>
        <div class="hh-wx" id="now-wx"></div>
      </div>
    </div>
  </section>

  <div class="board">
    ${todayCard(now, 0)}
    ${sleepCard(now, 1)}
    ${comingCard(now, 2)}
    ${card(`${header('Weather', { color: 'var(--blue)', eyebrow: 'Next 4 days' })}<div class="fc-row" id="wx4"><p class="empty">Loading forecast…</p></div>`, 'wx-card', 3)}
    ${countdownCard(now, 4)}
    ${leaderCard(5)}
    ${choresCard(choreStats, 6)}
  </div>`;
}

export function mount(root, rerender) {
  weather().then((w) => {
    minute(root); // paint the live weather into the sky
    const now = new Date();
    const { rise, set } = sunTimes(now, cfg.family.location.sun);
    const h = now.getHours() + now.getMinutes() / 60;
    const nw = root.querySelector('#now-wx');
    if (nw) nw.innerHTML = `<div class="hh-temp"><span class="wx-i">${w.now.icon}</span>${w.now.temp}°</div>
      <div class="hh-sky">${esc(skyLabel(w.now.code, h < rise || h > set))}</div>
      <div class="hh-hilo">H ${w.days[0].hi}° · L ${w.days[0].lo}°</div>`;
    const f = root.querySelector('#wx4');
    if (f) f.innerHTML = w.days.slice(0, 4).map((d, i) => {
      const dt = parseYmd(d.date);
      return `<div class="fc ${i === 0 ? 'today' : ''}" style="--i:${i}"><span class="fc-d">${i === 0 ? 'Today' : DOW3[dt.getDay()]}</span><span class="fc-i">${d.icon}</span>
        <span class="fc-l">${esc(skyLabel(d.code, false))}</span>
        <span class="fc-t"><b>${d.hi}°</b> ${d.lo}°</span><span class="fc-r">${d.rain >= 20 ? `💧${d.rain}%` : ''}</span></div>`;
    }).join('');
  }).catch(() => {
    const f = root.querySelector('#wx4');
    if (f) f.innerHTML = empty('Forecast unavailable right now.');
  });

  for (const slot of root.querySelectorAll('[data-lunch]')) {
    lunchLine(parseYmd(slot.dataset.lunch)).then((html) => { slot.innerHTML = html; if (!html) slot.remove(); });
  }

  // Tap a chore right from the board.
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chore]');
    if (!t) return;
    const chore = cfg.chores.chores.find((c) => c.id === t.dataset.chore);
    const on = store.toggleChore(chore, t.dataset.kid);
    if (on) { const r = t.getBoundingClientRect(); coinBurst(r.left + r.width / 2, r.top, chore.coins); }
    rerender();
  });
}

/** Called every minute by the shell: keep the sky honest without a full re-render. */
export function minute(root) {
  const s = root.querySelector('#scene .scene-svg');
  if (s) s.outerHTML = sceneSvg(new Date(), sceneOpts());
}

const sceneOpts = () => ({ sun: cfg.family.location.sun, weather: lastWeather()?.now });

// ---- Today ------------------------------------------------------------------------------------

const PE = /\bPE\b/;

/** School hours / no-school reason and today's specials, as "need to know" chips. */
function schoolChips(k, date) {
  const s = schoolOf(k);
  const sd = schoolDay(k.school, date);
  const out = [];
  if (sd.type !== 'none') {
    const [a, b] = sd.type === 'early' ? s.early : s.full;
    out.push(chip(`🏫 ${clock(a, false)}–${clock(b)}${sd.type === 'early' ? ' · early out' : ''}${sd.note ? ` · ${sd.note}` : ''}`, k.color));
    const sp = s.specials?.[date.getDay()];
    if (sp) out.push(chip(PE.test(sp) ? `👟 ${sp} — sneakers` : `🎨 ${sp}`, 'var(--lime)'));
  } else if (sd.note) {
    out.push(chip(`🎒 No school · ${sd.note}`, 'var(--acc)'));
  }
  return out;
}

/** A girl's own calendar items for `date` (not school, not family-wide), minus reminders the chips cover. */
function kidItems(k, date) {
  const sp = schoolDay(k.school, date).type !== 'none' ? schoolOf(k).specials?.[date.getDay()] : null;
  return itemsOn(date).filter((x) => x.who.includes(k.id) && x.kind !== 'school' && x.kind !== 'noschool'
    && !(sp && PE.test(sp) && PE.test(x.title))); // "Avery PE Day" is already the 👟 chip
}

function todayCard(now, i) {
  const ks = kids();
  const family = itemsOn(now).filter((x) => !x.who.length && x.kind !== 'school');
  const count = family.length + ks.reduce((s, k) => s + kidItems(k, now).length, 0);
  const tomorrow = addDays(now, 1);
  const schoolToday = ks.some((k) => schoolDay(k.school, now).type !== 'none');
  const schoolTomorrow = ks.some((k) => schoolDay(k.school, tomorrow).type !== 'none');

  const cols = ks.map((k) => {
    const items = kidItems(k, now);
    const next = items.find((x) => !x.allDay && x.start > now);
    const rows = items.map((x, j) => {
      const on = !x.allDay && x.start <= now && x.end > now;
      const past = !x.allDay && x.end <= now && !on;
      const state = on ? 'on' : past ? 'past' : x === next ? 'next' : '';
      return `<div class="td-row anim-row ${state}" style="--i:${j}">
        <span class="td-t">${x.allDay ? 'All day' : esc(clock(x.start))}</span>
        <span class="td-i">${esc(x.icon)}</span>
        <span class="td-main"><b>${esc(x.title)}</b>${x.detail || (!x.allDay && x.end > x.start) ? `<small>${esc([x.allDay ? '' : `until ${clock(x.end)}`, x.detail].filter(Boolean).join(' · '))}</small>` : ''}</span>
        ${on ? '<span class="td-in now">Now</span>' : x === next ? `<span class="td-in">in <b data-until="${+x.start}"></b></span>` : ''}
      </div>`;
    }).join('');
    const chips = schoolChips(k, now);
    return `
      <div class="td-kid" style="--c:${esc(k.color)}">
        <a class="td-head" href="#/calendar">${avatar(k, 'sm')}<span>${esc(k.name)}</span></a>
        ${chips.length ? `<div class="td-know">${chips.join('')}</div>` : ''}
        ${rows || `<p class="td-free">${chips.length ? 'Nothing else on the calendar.' : 'Free day 🎉'}</p>`}
      </div>`;
  }).join('');

  const tm = ks.map((k) => {
    const bits = [
      ...schoolChips(k, tomorrow),
      ...kidItems(k, tomorrow).map((x) => chip(`${x.icon} ${x.title}${x.allDay ? '' : ` ${clock(x.start)}`}`, k.color)),
    ];
    return `<div class="tm-kid" style="--c:${esc(k.color)}">${avatar(k, 'xs')}<div class="tm-bits">${bits.join('') || '<span class="muted small">Nothing yet</span>'}</div></div>`;
  }).join('');
  const tmFamily = itemsOn(tomorrow).filter((x) => !x.who.length && x.kind !== 'school');

  return card(`
    ${header('Today', { eyebrow: count ? `${plural(count, 'thing')} on the calendar` : 'Nothing on the calendar' })}
    ${family.length ? `<div class="td-family">${family.map((x) => chip(`${x.icon} ${x.title}${x.allDay ? '' : ` · ${clock(x.start)}`}`, 'var(--acc)')).join('')}</div>` : ''}
    <div class="td-cols">${cols}</div>
    ${schoolToday && now.getHours() < 13 ? `<div class="td-lunch" data-lunch="${ymd(now)}"></div>` : ''}
    <div class="td-tomorrow">
      <div class="sh-eyebrow">Tomorrow · ${esc(DOW[tomorrow.getDay()])}</div>
      ${tmFamily.length ? `<div class="td-family">${tmFamily.map((x) => chip(`${x.icon} ${x.title}`, 'var(--acc)')).join('')}</div>` : ''}
      ${tm}
      ${schoolTomorrow ? `<div class="td-lunch" data-lunch="${ymd(tomorrow)}"></div>` : ''}
    </div>`, 'today-card', i);
}

/** "🍱 Lunch · Mini Corn Dogs" with the sides underneath — one menu for both girls. */
async function lunchLine(day) {
  const [{ menu }] = await menuRange(cfg.school.lunch.source, day, 1);
  const lunch = menu?.lunch || [];
  const hot = lunch.find((m) => /hot/i.test(m.label)) || lunch[0];
  if (!hot?.main?.length) return `<span class="lh-icon">🍱</span><div><div class="lk">Lunch</div><div class="lm muted">Menu not posted yet</div></div>`;
  const sides = hot.sides.flatMap((x) => x.items);
  return `<span class="lh-icon">🍱</span>
    <div><div class="lk">Hot lunch</div><div class="lm">${esc(hot.main[0])}</div>${sides.length ? `<div class="ls">${esc(sides.join(' · '))}</div>` : ''}</div>
    <a class="sh-more" href="#/school">Menu <span aria-hidden="true">→</span></a>`;
}

// ---- Cards ------------------------------------------------------------------------------------

/** Where the girls sleep tonight, when it switches, and the week of nights at a glance. */
function sleepCard(now, i) {
  const tonight = sleepOn(now);
  if (!tonight) return '';
  const sw = nextSwitch(now);
  const nights = Array.from({ length: 7 }, (_, d) => addDays(now, d));
  const swWhen = sw ? (Math.round((new Date(ymd(sw.date) + 'T00:00') - new Date(ymd(now) + 'T00:00')) / 864e5) === 1 ? 'tomorrow' : DOW3[sw.date.getDay()]) : '';
  return card(`
    ${header('Tonight', { color: tonight.color, eyebrow: 'Where we’re sleeping' })}
    <div class="sleep-now" style="--c:${esc(tonight.color)}">
      <span class="sn-icon">${esc(tonight.icon)}</span>
      <div class="sn-text"><div class="sn-place">${esc(tonight.label)}</div>
      <div class="sn-sub">${sw ? `${esc(sw.label)} starting ${esc(swWhen)}` : 'All week'}</div></div>
    </div>
    ${weekendsLine(now)}
    <div class="nights">${nights.map((d, j) => {
      const s = sleepOn(d);
      return `<div class="night ${j === 0 ? 'today' : ''}" style="--c:${esc(s?.color || 'var(--t4)')};--i:${j}"><span class="nt-d">${j === 0 ? 'Tonight' : DOW3[d.getDay()]}</span><span class="nt-i">${esc(s?.icon || '·')}</span><span class="nt-l">${esc(s?.label || '')}</span></div>`;
    }).join('')}</div>`, 'sleep-card', i, `--c:${esc(tonight.color)}`);
}

/** "This weekend Dad's · Next weekend Mom's Oct 2–4" — the question that actually gets asked. */
function weekendsLine(now) {
  const dow = now.getDay();
  const thisFri = addDays(now, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow);
  const fmt = (f) => `${MONTH[f.getMonth()].slice(0, 3)} ${f.getDate()}–${addDays(f, 2).getDate()}`;
  const wk = [thisFri, addDays(thisFri, 7)].map((f, i) => {
    const s = sleepOn(f);
    const label = i === 0 ? (dow === 0 || dow >= 5 ? 'This weekend' : 'Weekend') : 'Next';
    return s ? `<span class="wkd" style="--c:${esc(s.color)}"><b>${label}</b> ${esc(s.icon)} ${esc(s.label)} <i>${fmt(f)}</i></span>` : '';
  });
  return `<div class="weekends">${wk.join('')}</div>`;
}

/** The next few notable things beyond this week — games, parties, events (not routine practices). */
function comingCard(now, i) {
  const ks = kids();
  const out = [];
  for (let d = 0; d < 60 && out.length < 7; d++) {
    const day = addDays(now, d);
    for (const x of itemsOn(day)) {
      if (x.kind === 'school' || x.kind === 'recurring' || (x.kind === 'noschool' && !x.firstOfRun)) continue;
      if (!x.allDay && x.end < now) continue;
      out.push({ ...x, date: day });
    }
  }
  return card(`
    ${header('Coming Up', { color: 'var(--blue)', href: '#/calendar', eyebrow: 'Games · parties · days off · holidays' })}
    ${out.slice(0, 7).map((x, j) => `
      <div class="cu-row anim-row ${x.kind}" style="--c:${esc(whoColor(x.who, ks))};--i:${j}">
        <div class="cu-date"><span class="cu-dow">${DOW3[x.date.getDay()]}</span><span class="cu-day">${x.date.getDate()}</span></div>
        <div class="cu-main"><div class="cu-title">${esc(x.icon)} ${esc(x.title)}</div>
          <div class="cu-sub">${esc([x.allDay ? relDay(x.date, now) : `${relDay(x.date, now)} · ${clock(x.start)}`, x.detail].filter(Boolean).join(' · '))}</div></div>
        <span class="row-dots">${whoDots(x.who, ks)}</span>
      </div>`).join('') || empty('Nothing on the books yet.')}`, 'coming-card', i);
}

function leaderCard(i) {
  const ks = [...kids()].sort((a, b) => store.balance(b.id) - store.balance(a.id));
  const max = Math.max(1, ...ks.map((k) => store.balance(k.id)));
  const pend = store.allPending().length;
  return card(`
    ${header('Leaderboard', { color: 'var(--coin)', href: '#/coins', eyebrow: cfg.chores.coinName, badge: pend ? `${pend} waiting` : null, badgeColor: 'var(--amber)' })}
    ${ks.map((k, r) => {
      const b = store.balance(k.id);
      const week = store.earnedByDay(k.id, 7).reduce((s, d) => s + d.sum, 0);
      return `<div class="lb-row anim-row" style="--c:${esc(k.color)};--i:${r}">
        <span class="lb-rank">${r === 0 && b > 0 ? '👑' : r + 1}</span>${avatar(k)}
        <div class="lb-main"><div class="lb-name">${esc(k.name)}<span>+${week} this week</span></div>
          <div class="bar coin"><span style="--w:${Math.max(3, (b / max) * 100)}%"></span></div></div>
        <span class="lb-val">🪙 <b data-count="${b}">${b}</b></span></div>`;
    }).join('')}`, 'leader-card', i);
}

function choresCard(choreStats, i) {
  const part = dayPart();
  const today = ymd();
  const cols = choreStats.map(({ k, list, done }) => {
    const frac = list.length ? done / list.length : 1;
    const todo = list.filter((c) => !store.isDone(today, c.id, k.id));
    const nowList = (todo.filter((c) => (c.part || 'morning') === part).length ? todo.filter((c) => (c.part || 'morning') === part) : todo).slice(0, 4);
    return `
      <div class="hc-col" style="--c:${esc(k.color)}">
        <a class="hc-head" href="#/chores/${k.id}">${ring(frac, k.color, 58, 6, avatar(k))}
          <div><div class="hc-name">${esc(k.name)}</div><div class="hc-sub">${done} of ${list.length} done</div></div></a>
        ${nowList.length ? nowList.map((c) => `
          <button class="mini-chore" data-chore="${c.id}" data-kid="${k.id}"><span class="mc-box"></span><span class="mc-i">${esc(c.icon)}</span><span class="mc-t">${esc(c.title)}</span><span class="mc-c">+${c.coins}</span></button>`).join('')
          : `<div class="hc-done">🎉 All done!</div>`}
      </div>`;
  }).join('');
  return card(`${header('Chores', { href: '#/chores', eyebrow: `${part === 'morning' ? 'This morning' : part === 'afternoon' ? 'After school' : 'This evening'} · tap to finish` })}<div class="hc-cols">${cols}</div>`, 'chores-card', i);
}

function countdownCard(now, i) {
  const ks = kids();
  const list = countdowns(now);
  if (!list.length) return '';
  return card(`${header('Countdowns', { color: 'var(--lime)', eyebrow: 'Days until' })}
    <div class="cd-grid">${list.map((c, j) => {
      const k = c.kid && ks.find((x) => x.id === c.kid);
      const when = `${MONTH[c.date.getMonth()].slice(0, 3)} ${c.date.getDate()}`;
      const label = c.days === 0 ? 'Today!' : k ? `${esc(k.name)} turns ${c.turns}` : esc(c.title);
      const sub = k ? when : c.turns ? `turns ${c.turns} · ${when}` : when;
      return `<div class="cd anim-row ${k ? 'kid' : c.kind}" style="--i:${j};${k ? `--c:${esc(k.color)}` : ''}">
        <span class="cd-i">${k ? avatar(k, 'sm') : esc(c.icon)}</span>
        <span class="cd-n" data-count="${c.days}">${c.days}</span>
        <span class="cd-l">${label}</span><span class="cd-s">${sub}</span></div>`;
    }).join('')}</div>`, 'cd-card', i);
}
