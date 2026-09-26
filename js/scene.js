// The Home hero illustration — Ervin Central's answer to the Catan companion's wolf-and-moon.
// A green hillside with the house on it; the sun and moon ride a real arc for the current time,
// the sky shifts through dawn / day / dusk / night, windows light up in the evening, and stars
// and fireflies come out after dark. Pure SVG + CSS animation; re-rendered once a minute.

const lerp = (a, b, t) => a + (b - a) * t;

function phase(h) {
  if (h < 5.5 || h >= 21) return 'night';
  if (h < 8) return 'dawn';
  if (h < 17.5) return 'day';
  return 'dusk';
}

const SKY = {
  night: ['#040b08', '#0a1c14', '#0d2419'],
  dawn: ['#0b1d19', '#1d3b31', '#6b4a2a'],
  day: ['#0c2621', '#17463a', '#2a6a4f'],
  dusk: ['#0a1612', '#233527', '#7a3f22'],
};

/** Deterministic pseudo-random so stars don't jump each minute. */
const rnd = (i) => { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); };

export function sceneSvg(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  const ph = phase(h);
  const [top, mid, low] = SKY[ph];

  // Sun: 6am → 8pm across the sky. Moon: 8pm → 6am.
  const sunT = (h - 6) / 14;
  const moonT = ((h >= 20 ? h - 20 : h + 4)) / 10;
  const arc = (t) => ({ x: lerp(40, 560, t), y: 230 - Math.sin(Math.PI * t) * 175 });
  const sunUp = sunT > -0.02 && sunT < 1.02;
  const sun = arc(Math.min(1, Math.max(0, sunT)));
  const moon = arc(Math.min(1, Math.max(0, moonT)));
  const dark = ph === 'night' || ph === 'dusk';
  const lit = h >= 17 || h < 7;

  const stars = dark ? Array.from({ length: 34 }, (_, i) => {
    const x = rnd(i) * 600, y = rnd(i + 99) * 150, r = 0.6 + rnd(i + 7) * 1.2;
    return `<circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" style="--d:${(rnd(i + 3) * 4).toFixed(2)}s"/>`;
  }).join('') : '';

  const flies = dark ? Array.from({ length: 12 }, (_, i) => {
    const x = 60 + rnd(i + 40) * 480, y = 200 + rnd(i + 60) * 70;
    return `<circle class="fly" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" style="--d:${(rnd(i + 5) * 6).toFixed(2)}s;--dx:${(rnd(i + 8) * 40 - 20).toFixed(0)}px;--dy:${(-10 - rnd(i + 9) * 30).toFixed(0)}px"/>`;
  }).join('') : '';

  const clouds = ph === 'day' || ph === 'dawn' ? `
    <g class="cloud" style="--d:0s"><ellipse cx="120" cy="70" rx="46" ry="12"/><ellipse cx="146" cy="62" rx="28" ry="12"/></g>
    <g class="cloud slow" style="--d:-30s"><ellipse cx="420" cy="48" rx="54" ry="11"/><ellipse cx="398" cy="41" rx="26" ry="10"/></g>` : '';

  return `
  <svg class="scene-svg" viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
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
    ${clouds}
    ${sunUp ? `<g class="sun" transform="translate(${sun.x.toFixed(1)} ${sun.y.toFixed(1)})"><circle r="80" fill="url(#sunGlow)" class="pulse"/><circle r="20" fill="#fde047"/><circle r="20" fill="none" stroke="#fef9c3" stroke-opacity=".6" stroke-width="3"/></g>` : ''}
    ${!sunUp || ph === 'night' ? `<g class="moon" transform="translate(${moon.x.toFixed(1)} ${moon.y.toFixed(1)})"><circle r="46" fill="url(#moonGlow)" class="pulse"/><circle r="14" fill="#e8f5ec"/><circle r="14" cx="6" cy="-4" fill="${top}" opacity=".9"/></g>` : ''}

    <path class="hill far" d="M0 205 C 90 165, 170 180, 250 190 S 420 160, 600 185 V300 H0Z" fill="url(#hillA)" opacity=".85"/>
    <path class="hill mid" d="M0 235 C 120 200, 220 215, 320 222 S 500 200, 600 215 V300 H0Z" fill="url(#hillB)"/>

    <g class="tree" transform="translate(470 205)"><rect x="-2.5" y="0" width="5" height="16" fill="#0b1f15"/><path d="M0 -30 L16 4 H-16Z" fill="#12402a"/><path d="M0 -40 L12 -12 H-12Z" fill="#175233"/></g>
    <g class="tree" transform="translate(500 212) scale(.8)"><rect x="-2.5" y="0" width="5" height="16" fill="#0b1f15"/><path d="M0 -30 L16 4 H-16Z" fill="#12402a"/><path d="M0 -40 L12 -12 H-12Z" fill="#175233"/></g>

    <g class="house" transform="translate(150 196)">
      <rect x="0" y="10" width="64" height="40" rx="2" fill="#0d261a"/>
      <path d="M-6 12 L32 -16 L70 12Z" fill="#12382a"/>
      <rect x="44" y="-12" width="8" height="14" fill="#0d261a"/>
      <rect x="26" y="28" width="12" height="22" rx="1.5" fill="#081a11"/>
      <rect x="8" y="20" width="12" height="11" rx="1.5" class="win ${lit ? 'on' : ''}"/>
      <rect x="44" y="20" width="12" height="11" rx="1.5" class="win ${lit ? 'on' : ''}" style="--d:1.3s"/>
    </g>

    <path class="hill near" d="M0 262 C 140 236, 260 248, 380 256 S 540 244, 600 250 V300 H0Z" fill="url(#hillC)"/>
    <g class="flies">${flies}</g>
  </svg>`;
}

export const scenePhase = (now = new Date()) => phase(now.getHours() + now.getMinutes() / 60);
