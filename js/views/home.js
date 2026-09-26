// Home — the wall display's resting screen. Laid out like a DAKboard family board: a big clock over
// a live landscape, the forecast, an "Up next" card with a running countdown, the agenda by day,
// lunch, chores you can tick right here, the coin leaderboard, and countdowns to the big days.

import { cfg, kids, itemsOn, upcoming, choresFor, menuRange, lunchHeadline, weather, schoolDay, schoolOf, sleepOn, nextSwitch, countdowns } from '../data.js';
import { store } from '../store.js';
import { card, header, stat, empty, avatar, whoDots, whoColor, chip, ring, coinBurst } from '../ui.js';
import { sceneSvg } from '../scene.js';
import { esc, greeting, longDate, clock, ymd, relDay, plural, dayPart, addDays, parseYmd, DOW3, MONTH } from '../util.js';

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
  const totalDone = choreStats.reduce((s, c) => s + c.done, 0);
  const total = choreStats.reduce((s, c) => s + c.list.length, 0);
  const next = countdowns(now)[0];

  return `
  <section class="home-hero anim-fade-up">
    <div class="hh-text">
      <div class="eyebrow">${esc(longDate(now))}</div>
      <h1 class="headline">${esc(greeting(now))}, <em>${esc(cfg.family.family)}s</em></h1>
      <p class="lede">${synthesis(now, choreStats)}</p>
      <div class="stat-row">
        ${stat(`${totalDone}/${total}`, 'Chores done', { hero: true })}
        ${ks.map((k) => stat(store.balance(k.id), `${k.name}'s coins`, { color: k.color })).join('')}
        ${next ? stat(next.days, `Days to ${next.kid ? `${next.title}'s birthday` : next.title}`) : ''}
      </div>
    </div>
    <div class="hh-scene" id="scene">
      ${sceneSvg(now)}
      <div class="scene-overlay">
        <div class="big-clock" data-clock="long"></div>
        <div class="now-wx" id="now-wx"></div>
      </div>
    </div>
  </section>

  <div class="forecast" id="forecast"></div>

  <div class="board">
    ${upNextCard(now, 0)}
    ${agendaCard(now, 1)}
    ${sleepCard(now, 2)}
    ${choresCard(choreStats, 3)}
    ${card(`${header('School Lunch', { color: 'var(--amber)', href: '#/school' })}<div id="home-lunch"><p class="empty">Loading menu…</p></div>`, 'lunch', 4)}
    ${comingCard(now, 5)}
    ${leaderCard(6)}
    ${countdownCard(now, 7)}
  </div>`;
}

export function mount(root, rerender) {
  weather().then((w) => {
    const now = root.querySelector('#now-wx');
    if (now) now.innerHTML = `<span class="wx-i">${w.now.icon}</span><span class="wx-t">${w.now.temp}°</span><span class="wx-l">${esc(w.now.label)} · ${w.days[0].hi}° / ${w.days[0].lo}°</span>`;
    const f = root.querySelector('#forecast');
    if (f) f.innerHTML = w.days.slice(0, 7).map((d, i) => {
      const dt = parseYmd(d.date);
      return `<div class="fc ${i === 0 ? 'today' : ''}" style="--i:${i}"><span class="fc-d">${i === 0 ? 'Today' : DOW3[dt.getDay()]}</span><span class="fc-i">${d.icon}</span>
        <span class="fc-t"><b>${d.hi}°</b> ${d.lo}°</span>${d.rain >= 30 ? `<span class="fc-r">💧${d.rain}%</span>` : '<span class="fc-r"></span>'}</div>`;
    }).join('');
  }).catch(() => {});

  const slot = root.querySelector('#home-lunch');
  if (slot) lunchBody(new Date()).then((html) => { slot.innerHTML = html; });

  // Tap a chore right from the board (DAKboard-style).
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
  if (s) s.outerHTML = sceneSvg(new Date());
}

// ---- Synthesis -------------------------------------------------------------------------------

function synthesis(now, choreStats) {
  const parts = [];
  const ks = kids();
  const days = ks.map((k) => schoolDay(k.school, now));
  if (days.every((d) => d.type === 'none')) parts.push(days[0].reason === 'Weekend' ? 'No school today' : esc(days[0].reason));
  else if (days.some((d) => d.type === 'early')) parts.push(`<b>Early out</b> — ${ks.map((k) => `${esc(k.name)} ${clock(schoolOf(k).early[1])}`).join(', ')}`);

  const nx = upcoming(1, now).find((i) => i.kind !== 'school' && !i.allDay && i.start > now);
  if (nx) parts.push(`<b>${esc(nx.title)}</b> at ${clock(nx.start)}`);

  const left = choreStats.filter((c) => c.left);
  if (!left.length && choreStats.some((c) => c.list.length)) parts.push('every chore is done 🎉');
  else if (left.length) parts.push(left.map((c) => `${esc(c.k.name)} has ${plural(c.left, 'chore')} left`).join(', '));

  const pend = store.allPending().length;
  if (pend) parts.push(`${plural(pend, 'request')} waiting on a parent`);
  return parts.join(' · ') || 'A quiet day.';
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
    <div class="sleep-now" style="--c:${tonight.color}">
      <span class="sn-icon">${esc(tonight.icon)}</span>
      <div class="sn-text"><div class="sn-place">${esc(tonight.label)}</div>
      <div class="sn-sub">${sw ? `${esc(sw.label)} starting ${esc(swWhen)}` : 'All week'}</div></div>
    </div>
    ${weekendsLine(now)}
    <div class="nights">${nights.map((d, j) => {
      const s = sleepOn(d);
      return `<div class="night ${j === 0 ? 'today' : ''}" style="--c:${s?.color || 'var(--t4)'};--i:${j}"><span class="nt-d">${j === 0 ? 'Tonight' : DOW3[d.getDay()]}</span><span class="nt-i">${esc(s?.icon || '·')}</span><span class="nt-l">${esc(s?.label || '')}</span></div>`;
    }).join('')}</div>`, 'sleep-card', i, `--c:${tonight.color}`);
}

/** "This weekend Dad's · Next weekend Mom's Oct 2–4" — the question that actually gets asked. */
function weekendsLine(now) {
  const dow = now.getDay();
  const thisFri = addDays(now, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow);
  const fmt = (f) => `${MONTH[f.getMonth()].slice(0, 3)} ${f.getDate()}–${addDays(f, 2).getDate()}`;
  const wk = [thisFri, addDays(thisFri, 7)].map((f, i) => {
    const s = sleepOn(f);
    const label = i === 0 ? (dow === 0 || dow >= 5 ? 'This weekend' : 'Weekend') : 'Next';
    return s ? `<span class="wkd" style="--c:${s.color}"><b>${label}</b> ${esc(s.icon)} ${esc(s.label)} <i>${fmt(f)}</i></span>` : '';
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
      if (x.kind === 'school' || x.kind === 'recurring') continue;
      if (!x.allDay && x.end < now) continue;
      out.push({ ...x, date: day });
    }
  }
  return card(`
    ${header('Coming Up', { color: 'var(--blue)', href: '#/calendar', eyebrow: 'Games · parties · birthdays · holidays' })}
    ${out.slice(0, 7).map((x, j) => `
      <div class="cu-row anim-row ${x.kind}" style="--c:${whoColor(x.who, ks)};--i:${j}">
        <div class="cu-date"><span class="cu-dow">${DOW3[x.date.getDay()]}</span><span class="cu-day">${x.date.getDate()}</span></div>
        <div class="cu-main"><div class="cu-title">${esc(x.icon)} ${esc(x.title)}</div>
          <div class="cu-sub">${esc([x.allDay ? relDay(x.date, now) : `${relDay(x.date, now)} · ${clock(x.start)}`, x.detail].filter(Boolean).join(' · '))}</div></div>
        <span class="row-dots">${whoDots(x.who, ks)}</span>
      </div>`).join('') || empty('Nothing on the books yet.')}`, 'coming-card', i);
}

function upNextCard(now, i) {
  const ks = kids();
  // School only counts as "up next" when it's the next thing this morning, not two days out.
  const list = upcoming(3, now).filter((x) => !x.allDay && x.start > now && (x.kind !== 'school' || x.start - now < 12 * 36e5));
  const allDay = itemsOn(now).filter((x) => x.allDay);
  const n = list[0];
  const color = n ? whoColor(n.who, ks) : 'var(--acc)';
  const body = n ? `
    <div class="upnext" style="--c:${color}">
      <div class="un-icon">${esc(n.icon)}</div>
      <div class="un-main">
        <div class="un-title">${esc(n.title)}</div>
        <div class="un-when">${esc(relDay(n.date, now))} · ${clock(n.start)}${n.end > n.start ? ` – ${clock(n.end)}` : ''}</div>
        ${n.detail ? `<div class="un-sub">${esc(n.detail)}</div>` : ''}
        <div class="un-who">${whoDots(n.who, ks)}<span>${esc(n.who.length ? n.who.map((id) => ks.find((k) => k.id === id)?.name).join(' & ') : 'Family')}</span></div>
      </div>
      <div class="un-count"><span class="un-in">in</span><span class="un-t" data-until="${+n.start}"></span></div>
    </div>
    ${list.slice(1, 5).map((x, j) => `
      <div class="un-later anim-row" style="--i:${j}"><span class="ul-t">${esc(relDay(x.date, now) === 'Today' ? clock(x.start) : `${DOW3[x.date.getDay()]} ${clock(x.start, false)}`)}</span>
        <span class="ul-n">${esc(x.icon)} ${esc(x.title)}</span><span class="row-dots">${whoDots(x.who, ks)}</span></div>`).join('')}`
    : empty('Nothing scheduled in the next few days.');
  return card(`
    ${header('Up Next', { eyebrow: allDay.length ? `Today: ${allDay.map((a) => a.title).join(' · ')}` : 'Coming up' })}
    ${body}`, 'upnext-card', i);
}

function agendaCard(now, i) {
  const ks = kids();
  const days = Array.from({ length: 5 }, (_, d) => addDays(now, d));
  const blocks = days.map((d) => {
    const items = itemsOn(d).filter((x) => d.getDate() !== now.getDate() || x.allDay || x.end > now);
    return `
      <div class="ag-day">
        <div class="ag-head"><span class="ag-dow">${esc(relDay(d, now))}</span><span class="ag-date">${d.getMonth() + 1}/${d.getDate()}</span></div>
        ${items.length ? items.map((x, j) => `
          <div class="ag-item anim-row ${x.kind}" style="--c:${whoColor(x.who, ks)};--i:${j}">
            <span class="ag-t">${x.allDay ? 'All day' : clock(x.start, false)}</span>
            <span class="ag-n">${esc(x.icon)} ${esc(x.title)}</span>
            <span class="row-dots">${whoDots(x.who, ks)}</span>
          </div>`).join('') : '<div class="ag-free">Nothing planned</div>'}
      </div>`;
  }).join('');
  return card(`${header('Agenda', { href: '#/calendar', eyebrow: 'Next 5 days' })}<div class="agenda">${blocks}</div>`, 'agenda-card', i);
}

/** One menu for both girls — ADM's elementaries serve the same lunch. After 1pm, look ahead. */
async function lunchBody(now) {
  const ks = kids();
  const day = new Date(now);
  if (now.getHours() >= 13) day.setDate(day.getDate() + 1);
  for (let i = 0; i < 7 && ks.every((k) => schoolDay(k.school, day).type === 'none'); i++) day.setDate(day.getDate() + 1);
  const [{ menu }] = await menuRange(cfg.school.lunch.source, day, 1);
  const lunch = menu?.lunch || [];
  const hot = lunch.find((m) => /hot/i.test(m.label)) || lunch[0];
  const others = lunch.filter((m) => m !== hot);
  const sides = hot?.sides.flatMap((x) => x.items) || [];
  return `
    <div class="sh-eyebrow lunch-when">${esc(relDay(day, now))} · both girls</div>
    <div class="lunch-hero anim-row">
      <span class="lh-icon">🍱</span>
      <div><div class="lk">Hot lunch</div><div class="lm">${esc(hot?.main?.[0] || 'Menu not posted yet')}</div></div>
      <span class="lh-kids">${ks.map((k) => avatar(k, 'xs')).join('')}</span>
    </div>
    ${sides.length ? `<div class="meal-sides">${sides.map((x) => chip(x, 'var(--amber)')).join('')}</div>` : ''}
    ${others.map((m) => `<div class="lunch-alt"><span class="meal-l">${esc(m.label)}</span>${m.main.map((x) => chip(x.replace(/\s*\(.*\)\s*$/, ''))).join('')}</div>`).join('')}`;
}

function choresCard(choreStats, i) {
  const part = dayPart();
  const today = ymd();
  const cols = choreStats.map(({ k, list, done }) => {
    const frac = list.length ? done / list.length : 1;
    const todo = list.filter((c) => !store.isDone(today, c.id, k.id));
    const nowList = (todo.filter((c) => (c.part || 'morning') === part).length ? todo.filter((c) => (c.part || 'morning') === part) : todo).slice(0, 4);
    return `
      <div class="hc-col" style="--c:${k.color}">
        <a class="hc-head" href="#/chores/${k.id}">${ring(frac, k.color, 58, 6, avatar(k))}
          <div><div class="hc-name">${esc(k.name)}</div><div class="hc-sub">${done} of ${list.length} done</div></div></a>
        ${nowList.length ? nowList.map((c) => `
          <button class="mini-chore" data-chore="${c.id}" data-kid="${k.id}"><span class="mc-box"></span><span class="mc-i">${esc(c.icon)}</span><span class="mc-t">${esc(c.title)}</span><span class="mc-c">+${c.coins}</span></button>`).join('')
          : `<div class="hc-done">🎉 All done!</div>`}
      </div>`;
  }).join('');
  return card(`${header('Chores', { href: '#/chores', eyebrow: `${part === 'morning' ? 'This morning' : part === 'afternoon' ? 'After school' : 'This evening'} · tap to finish` })}<div class="hc-cols">${cols}</div>`, 'chores-card', i);
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
      return `<div class="lb-row anim-row" style="--c:${k.color};--i:${r}">
        <span class="lb-rank">${r === 0 && b > 0 ? '👑' : r + 1}</span>${avatar(k)}
        <div class="lb-main"><div class="lb-name">${esc(k.name)}<span>+${week} this week</span></div>
          <div class="bar coin"><span style="--w:${Math.max(3, (b / max) * 100)}%"></span></div></div>
        <span class="lb-val">🪙 <b data-count="${b}">${b}</b></span></div>`;
    }).join('')}`, 'leader-card', i);
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
      return `<div class="cd anim-row ${k ? 'kid' : c.kind}" style="--i:${j};${k ? `--c:${k.color}` : ''}">
        <span class="cd-i">${k ? avatar(k, 'sm') : esc(c.icon)}</span>
        <span class="cd-n" data-count="${c.days}">${c.days}</span>
        <span class="cd-l">${label}</span><span class="cd-s">${sub}</span></div>`;
    }).join('')}</div>`, 'cd-card', i);
}
