// The Home hero illustration — Ervin Central's answer to the Catan companion's wolf-and-moon.
// A green hillside with the house on it; the sun and moon ride a real arc between this month's
// sunrise and sunset (Des Moines averages from data/family.json), the sky shifts through dawn / day /
// dusk / night, windows light up in the evening, and stars and fireflies come out after dark.
// The live weather paints over it: clouds, overcast, fog, rain, snow and lightning.
// Pure SVG + CSS animation; re-rendered once a minute.

const lerp = (a, b, t) => a + (b - a) * t;
const hours = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h + m / 60; };

// Used when family.json has no sun table.
const FALLBACK_SUN = { rise: 6.5, set: 19.5 };

/** Sunrise / sunset (decimal hours) for `now`, blended between the mid-month averages. */
export function sunTimes(now, table) {
  if (!table) return FALLBACK_SUN;
  const at = (m) => table[((m % 12) + 12) % 12 + 1].map(hours); // m is 0-based and may wrap to -1 or 12
  const m = now.getMonth();
  const f = (now.getDate() - 15) / 30;
  const [a, b, t] = f < 0 ? [at(m - 1), at(m), 1 + f] : [at(m), at(m + 1), f];
  return { rise: lerp(a[0], b[0], t), set: lerp(a[1], b[1], t) };
}

function phase(h, { rise, set }) {
  if (h < rise - 0.75 || h >= set + 0.75) return 'night';
  if (h < rise + 1.25) return 'dawn';
  if (h < set - 1.25) return 'day';
  return 'dusk';
}

/** Open-Meteo weather code → what the sky should do. */
export function skyKind(code) {
  if (code == null) return 'clear';
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'clear';
}

const SKY = {
  night: ['#040b08', '#0a1c14', '#0d2419'],
  dawn: ['#0b1d19', '#1d3b31', '#6b4a2a'],
  day: ['#0c2621', '#17463a', '#2a6a4f'],
  dusk: ['#0a1612', '#233527', '#7a3f22'],
};
// Overcast skies: the same phases, greyed out.
const GREY = {
  night: ['#060a09', '#0e1613', '#131d19'],
  dawn: ['#10181a', '#233029', '#3f3a31'],
  day: ['#16211e', '#2a3833', '#44544c'],
  dusk: ['#0f1513', '#252d28', '#46362c'],
};

/** Deterministic pseudo-random so stars and raindrops don't jump each minute. */
const rnd = (i) => { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); };

const cloud = (x, y, s, cls, d) =>
  `<g class="cloud ${cls}" style="--d:${d}s"><g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="46" ry="12"/><ellipse cx="24" cy="-8" rx="28" ry="12"/><ellipse cx="-20" cy="-4" rx="22" ry="9"/></g></g>`;

function cloudLayer(kind, ph) {
  if (kind === 'clear') {
    return ph === 'day' || ph === 'dawn' ? cloud(120, 70, 1, '', 0) + cloud(420, 48, 0.9, 'slow', -30) : '';
  }
  if (kind === 'partly') {
    return [[90, 60, 1.1, '', 0], [300, 40, 0.9, 'slow', -20], [470, 80, 1.2, '', -45], [200, 95, 0.7, 'slow', -70]]
      .map(([x, y, s, c, d]) => cloud(x, y, s, `${c} puffy`, d)).join('');
  }
  // Overcast: a heavy deck of big, darker clouds.
  return Array.from({ length: 8 }, (_, i) =>
    cloud(rnd(i + 200) * 600, 20 + rnd(i + 210) * 80, 1.3 + rnd(i + 220) * 0.9, `heavy ${i % 2 ? 'slow' : ''}`, -(rnd(i + 230) * 90).toFixed(1))).join('');
}

function precip(kind) {
  if (kind === 'rain' || kind === 'storm') {
    const n = kind === 'storm' ? 90 : 60;
    return `<g class="rain">${Array.from({ length: n }, (_, i) => {
      const x = rnd(i + 300) * 640, y = rnd(i + 400) * 300;
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 3).toFixed(1)}" y2="${(y + 12).toFixed(1)}" style="--d:${(-rnd(i + 500)).toFixed(2)}s;--t:${(0.6 + rnd(i + 600) * 0.4).toFixed(2)}s"/>`;
    }).join('')}</g>${kind === 'storm' ? '<rect class="lightning" width="600" height="300"/>' : ''}`;
  }
  if (kind === 'snow') {
    return `<g class="snow">${Array.from({ length: 60 }, (_, i) => {
      const x = rnd(i + 700) * 600, y = rnd(i + 800) * 300;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + rnd(i + 900) * 1.6).toFixed(2)}" style="--d:${(-rnd(i + 1000) * 10).toFixed(2)}s;--t:${(7 + rnd(i + 1100) * 6).toFixed(1)}s;--dx:${(rnd(i + 1200) * 30 - 15).toFixed(0)}px"/>`;
    }).join('')}</g>`;
  }
  if (kind === 'fog') {
    return `<g class="fog"><rect x="-100" y="150" width="800" height="40" rx="20" style="--d:0s"/><rect x="-100" y="195" width="800" height="45" rx="22" style="--d:-12s"/><rect x="-100" y="240" width="800" height="50" rx="25" style="--d:-24s"/></g>`;
  }
  return '';
}

/** `opts.sun` = the month table from family.json; `opts.weather` = { code } from Open-Meteo. */
export function sceneSvg(now = new Date(), opts = {}) {
  const h = now.getHours() + now.getMinutes() / 60;
  const sunT0 = sunTimes(now, opts.sun);
  const ph = phase(h, sunT0);
  const kind = skyKind(opts.weather?.code);
  const overcast = kind !== 'clear' && kind !== 'partly';
  const [top, mid, low] = (overcast ? GREY : SKY)[ph];

  // Sun: sunrise → sunset across the sky. Moon: sunset → next sunrise.
  const { rise, set } = sunT0;
  const sunT = (h - rise) / (set - rise);
  const moonT = ((h - set + 24) % 24) / (24 - set + rise);
  const arc = (t) => ({ x: lerp(40, 560, t), y: 230 - Math.sin(Math.PI * t) * 175 });
  const sunUp = sunT > -0.02 && sunT < 1.02;
  const sun = arc(Math.min(1, Math.max(0, sunT)));
  const moon = arc(Math.min(1, Math.max(0, moonT)));
  const dark = ph === 'night' || ph === 'dusk';
  const lit = h >= set - 0.75 || h < rise + 0.5 || (overcast && kind !== 'fog');
  const hidden = overcast ? 'veiled' : ''; // sun/moon dimmed behind the cloud deck

  const stars = dark && !overcast ? Array.from({ length: 34 }, (_, i) => {
    const x = rnd(i) * 600, y = rnd(i + 99) * 150, r = 0.6 + rnd(i + 7) * 1.2;
    return `<circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" style="--d:${(rnd(i + 3) * 4).toFixed(2)}s"/>`;
  }).join('') : '';

  const flies = dark && kind !== 'rain' && kind !== 'storm' && kind !== 'snow' ? Array.from({ length: 12 }, (_, i) => {
    const x = 60 + rnd(i + 40) * 480, y = 200 + rnd(i + 60) * 70;
    return `<circle class="fly" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" style="--d:${(rnd(i + 5) * 6).toFixed(2)}s;--dx:${(rnd(i + 8) * 40 - 20).toFixed(0)}px;--dy:${(-10 - rnd(i + 9) * 30).toFixed(0)}px"/>`;
  }).join('') : '';

  return `
  <svg class="scene-svg sky-${kind}" viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${top}"/><stop offset=".62" stop-color="${mid}"/><stop offset="1" stop-color="${low}"/>
      </linearGradient>
      <radialGradient id="sunGlow"><stop offset="0" stop-color="#fef9c3" stop-opacity="1"/><stop offset=".3" stop-color="#fde047" stop-opacity=".45"/><stop offset="1" stop-color="#fcd34d" stop-opacity="0"/></radialGradient>
      <radialGradient id="moonGlow"><stop offset="0" stop-color="#e8fff1" stop-opacity=".55"/><stop offset="1" stop-color="#e8fff1" stop-opacity="0"/></radialGradient>
      <linearGradient id="hillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c5236"/><stop offset="1" stop-color="#0c2419"/></linearGradient>
      <linearGradient id="hillB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#236a43"/><stop offset="1" stop-color="#0e2c1e"/></linearGradient>
      <linearGradient id="hillC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8a55"/><stop offset="1" stop-color="#0f3322"/></linearGradient>
    </defs>
    <rect width="600" height="300" fill="url(#sky)"/>
    <g class="stars">${stars}</g>
    ${sunUp ? `<g class="sun ${hidden}" transform="translate(${sun.x.toFixed(1)} ${sun.y.toFixed(1)})"><circle r="80" fill="url(#sunGlow)" class="pulse"/><circle r="20" fill="#fde047"/><circle r="20" fill="none" stroke="#fef9c3" stroke-opacity=".6" stroke-width="3"/></g>` : ''}
    ${!sunUp || ph === 'night' ? `<g class="moon ${hidden}" transform="translate(${moon.x.toFixed(1)} ${moon.y.toFixed(1)})"><circle r="46" fill="url(#moonGlow)" class="pulse"/><circle r="14" fill="#e8f5ec"/><circle r="14" cx="6" cy="-4" fill="${top}" opacity=".9"/></g>` : ''}
    ${cloudLayer(kind, ph)}

    <path class="hill far" d="M0 205 C 90 165, 170 180, 250 190 S 420 160, 600 185 V300 H0Z" fill="url(#hillA)" opacity=".85"/>
    <path class="hill mid" d="M0 235 C 120 200, 220 215, 320 222 S 500 200, 600 215 V300 H0Z" fill="url(#hillB)"/>
    ${kind === 'snow' ? '<path class="snowcap" d="M0 205 C 90 165, 170 180, 250 190 S 420 160, 600 185 V192 C 420 168, 330 196, 250 197 S 90 172, 0 212Z"/>' : ''}

    <g class="tree" transform="translate(470 205)"><rect x="-2.5" y="0" width="5" height="16" fill="#0b1f15"/><path d="M0 -30 L16 4 H-16Z" fill="#12402a"/><path d="M0 -40 L12 -12 H-12Z" fill="#175233"/></g>
    <g class="tree" transform="translate(500 212) scale(.8)"><rect x="-2.5" y="0" width="5" height="16" fill="#0b1f15"/><path d="M0 -30 L16 4 H-16Z" fill="#12402a"/><path d="M0 -40 L12 -12 H-12Z" fill="#175233"/></g>

    <g class="house" transform="translate(150 196)">
      <rect x="0" y="10" width="64" height="40" rx="2" fill="#0d261a"/>
      <path d="M-6 12 L32 -16 L70 12Z" fill="#12382a"/>
      ${kind === 'snow' ? '<path d="M-6 12 L32 -16 L70 12 L64 12 L32 -10 L0 12Z" fill="#e8f5ec" opacity=".85"/>' : ''}
      <rect x="44" y="-12" width="8" height="14" fill="#0d261a"/>
      <rect x="26" y="28" width="12" height="22" rx="1.5" fill="#081a11"/>
      <rect x="8" y="20" width="12" height="11" rx="1.5" class="win ${lit ? 'on' : ''}"/>
      <rect x="44" y="20" width="12" height="11" rx="1.5" class="win ${lit ? 'on' : ''}" style="--d:1.3s"/>
    </g>

    <path class="hill near" d="M0 262 C 140 236, 260 248, 380 256 S 540 244, 600 250 V300 H0Z" fill="url(#hillC)"/>
    ${kind === 'snow' ? '<path class="snowcap" d="M0 262 C 140 236, 260 248, 380 256 S 540 244, 600 250 V258 C 540 252, 440 262, 380 263 S 140 244, 0 270Z"/>' : ''}
    <g class="flies">${flies}</g>
    ${precip(kind)}
  </svg>`;
}

export const scenePhase = (now = new Date(), sun) => phase(now.getHours() + now.getMinutes() / 60, sunTimes(now, sun));
