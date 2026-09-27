// Adds the ADM district's no-school days and non-Friday early dismissals (from data/school.json) to
// the "Kids" calendar in Calendar.app. Safe to re-run: events it made carry a marker in their notes
// and are skipped if already there.
//
//   osascript -l JavaScript scripts/adm-to-kids-calendar.js "$(cat data/school.json)"
//
// Past days are skipped. A run of consecutive no-school days with the same label (a break) becomes
// one multi-day event.
const MARK = 'Added by Ervin Central from the ADM academic calendar.';

function run(argv) {
  const school = JSON.parse(argv[0]);
  const y = school.year;
  const mv = school.schools.mv, ae = school.schools.ae;
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
  const earlyNote = `Early dismissal: Evie ${hm(mv.early[1])} (Meadow View), Avery ${hm(ae.early[1])} (Adel Elementary).`;
  const parse = (s) => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = iso(new Date());
  const entry = (n) => (typeof n === 'string' ? { date: n } : n);

  // Group no-school days into runs (weekends in between don't break a run).
  const off = y.noSchool.map(entry).sort((a, b) => (a.date < b.date ? -1 : 1));
  const runs = [];
  for (const n of off) {
    const last = runs[runs.length - 1];
    const gap = last ? (parse(n.date) - parse(last.end)) / 864e5 : 99;
    if (last && last.label === n.label && gap <= 3) last.end = n.date;
    else runs.push({ start: n.date, end: n.date, label: n.label || 'No school' });
  }
  const wanted = runs.map((r) => ({
    title: `No School - ${r.label.replace(/^\w/, (c) => c.toUpperCase())}`, start: r.start, end: r.end, note: 'Both girls off.',
  }));
  for (const e of (y.extraEarlyOut || []).map(entry)) {
    const label = e.label === 'Last day of school' ? 'Last Day of School - Early Dismissal'
      : `Early Dismissal - ${e.label === 'P/T conferences' ? 'Parent/Teacher Conferences (2:00–7:30 PM)' : e.label}`;
    wanted.push({ title: label, start: e.date, end: e.date, note: earlyNote });
  }

  const Cal = Application('Calendar');
  const kids = Cal.calendars.whose({ name: 'Kids' })[0];
  // One bulk read, then match in JS — `whose` date queries crawl on a calendar with years of events.
  const starts = kids.events.startDate();
  const existing = new Set(kids.events.summary().map((t, i) => `${t}|${iso(starts[i])}`));
  const made = [], skipped = [];
  for (const w of wanted) {
    if (w.end < today) { skipped.push(`${w.start} ${w.title} (past)`); continue; }
    const start = parse(w.start);
    const end = parse(w.end); end.setDate(end.getDate() + 1);
    if (existing.has(`${w.title}|${w.start}`)) { skipped.push(`${w.start} ${w.title} (already there)`); continue; }
    const ev = Cal.Event({ summary: w.title, startDate: start, endDate: end, alldayEvent: true, description: `${w.note}\n${MARK}` });
    kids.events.push(ev);
    made.push(`${w.start}${w.end !== w.start ? '→' + w.end : ''} ${w.title}`);
  }
  return JSON.stringify({ made, skipped }, null, 1);
}
