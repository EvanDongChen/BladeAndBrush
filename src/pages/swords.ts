/**
 * Inline SVG swords, used as the play-field cursor. Each blade is shaded in two faces split by a ridge line,
 * with a gradient along its length, a wavy temper line and a specular streak, which is what gives the
 * flat drawing its faux-3D look. Presentation only.
 */

type Fx = 'flame' | 'wave' | 'ghost' | 'none';

interface Look {
  /** Blade gradient, tip to base. */
  steel: [string, string, string];
  /** Hilt wrap and pommel colour. */
  wrap: string;
  /** Guard gradient, light to dark. */
  guard: [string, string];
  /** Blade half-width. */
  half: number;
  fx: Fx;
}

const STEEL: Look = { steel: ['#f4f6f8', '#aab3bd', '#6c7682'], wrap: '#7d1f23', guard: ['#e8cf8b', '#8a6a2a'], half: 4.5, fx: 'none' };

const LOOKS: Record<string, Look> = {
  slash: { ...STEEL },
  push: { steel: ['#9aa0a8', '#5c626b', '#33373e'], wrap: '#3f6b5c', guard: ['#c9c2b4', '#5d574b'], half: 6.5, fx: 'none' },
  fire: { steel: ['#ffe08a', '#ee7a2c', '#a8281c'], wrap: '#4a1710', guard: ['#f5c36a', '#8c4a16'], half: 4.5, fx: 'flame' },
  water: { steel: ['#e6fbff', '#74b8d8', '#2c6a96'], wrap: '#1f4d73', guard: ['#cfe7ee', '#4d7f94'], half: 4.5, fx: 'wave' },
  null: { steel: ['#ffffff', '#d5d8e2', '#9a9db0'], wrap: '#575a6e', guard: ['#e4e4ee', '#8a8da0'], half: 4.5, fx: 'ghost' },
};

let seq = 0;

/** A sword drawn point-up in a 40 x 120 box. `id` picks the look; unknown ids get plain steel. */
export function swordSvg(id: string): string {
  const look = LOOKS[id] ?? STEEL;
  const u = `sw${++seq}`;
  const w = look.half;
  const L = 20 - w;
  const R = 20 + w;
  const tip = '20.6,2';
  const bladeAll = `M${tip} L${R},10 L${R},78 L${L},78 L${L},11 Z`;
  const fx =
    look.fx === 'flame'
      ? [0, 1, 2, 3, 4]
          .map((i) => {
            const y = 70 - i * 13;
            const x = i % 2 ? R + 1 : L - 1;
            return `<path class="fx-flame" style="animation-delay:${i * 0.18}s" d="M${x},${y} C${x - 3},${y - 4} ${x + 2},${y - 6} ${x},${y - 11} C${x + 5},${y - 6} ${x + 4},${y - 3} ${x},${y} Z" fill="#ffb347" stroke="#ff6a1a" stroke-width=".5"/>`;
          })
          .join('')
      : look.fx === 'wave'
        ? `<path d="M${L},60 q2.2,-3 4.5,0 t4.5,0 t4.5,0 M${L},48 q2.2,-3 4.5,0 t4.5,0 t4.5,0" fill="none" stroke="#e6fbff" stroke-width="1" opacity=".75"/>
           <circle class="fx-drop" cx="${R + 4}" cy="52" r="1.6" fill="#74b8d8"/><circle class="fx-drop" style="animation-delay:.7s" cx="${L - 4}" cy="34" r="1.2" fill="#74b8d8"/>`
        : '';
  return `<svg class="sword ${look.fx === 'ghost' ? 'ghost' : ''}" viewBox="0 0 40 120" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${look.steel[0]}"/><stop offset=".55" stop-color="${look.steel[1]}"/><stop offset="1" stop-color="${look.steel[2]}"/>
    </linearGradient>
    <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.guard[0]}"/><stop offset="1" stop-color="${look.guard[1]}"/></linearGradient>
    <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${u}c"><path d="${bladeAll}"/></clipPath>
  </defs>
  <ellipse cx="22" cy="116" rx="9" ry="2" fill="rgba(0,0,0,.18)"/>
  <path d="M${tip} L${L},11 L${L},78 L20,78 Z" fill="url(#${u}b)"/>
  <path d="M${tip} L${R},10 L${R},78 L20,78 Z" fill="url(#${u}b)"/>
  <path d="M${tip} L${R},10 L${R},78 L20,78 Z" fill="#000" opacity=".28"/>
  <path d="M${tip} L${L},11 L${L},78 L20,78 Z" fill="#fff" opacity=".18"/>
  <path d="M${R - 1.5},76 q-1.5,-4 0,-8 t0,-8 t0,-8 t0,-8" fill="none" stroke="#fff" stroke-width=".7" opacity=".55"/>
  <path d="M20.3,3 L20.3,78" stroke="#fff" stroke-width=".6" opacity=".7"/>
  <path d="${bladeAll}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".7" stroke-linejoin="round"/>
  <g clip-path="url(#${u}c)"><rect class="shine" x="-14" y="0" width="14" height="80" fill="url(#${u}s)" transform="skewX(-18)"/></g>
  ${fx}
  <rect x="${L - 2}" y="78" width="${w * 2 + 4}" height="2.5" rx="1" fill="#2a2420" opacity=".5"/>
  <ellipse cx="20" cy="80.5" rx="${w + 6.5}" ry="3.6" fill="url(#${u}g)" stroke="rgba(0,0,0,.45)" stroke-width=".7"/>
  <ellipse cx="20" cy="79.6" rx="${w + 3}" ry="1" fill="#fff" opacity=".4"/>
  <rect x="16.5" y="83" width="7" height="27" rx="2" fill="${look.wrap}" stroke="rgba(0,0,0,.5)" stroke-width=".7"/>
  <path d="M16.5,86 l7,5 M16.5,91 l7,5 M16.5,96 l7,5 M16.5,101 l7,5 M23.5,86 l-7,5 M23.5,91 l-7,5 M23.5,96 l-7,5 M23.5,101 l-7,5" stroke="#fff" stroke-width=".6" opacity=".28"/>
  <rect x="16.5" y="83" width="2.6" height="27" rx="1.3" fill="#fff" opacity=".18"/>
  <ellipse cx="20" cy="112" rx="4.6" ry="3" fill="url(#${u}g)" stroke="rgba(0,0,0,.5)" stroke-width=".7"/>
</svg>`;
}

/**
 * CSS cursor value for an ability: its sword angled up-left with the blade tip at the hotspot, so
 * the point of the sword is where a slash starts. Falls back to a crosshair.
 */
export function swordCursor(id: string): string {
  const inner = swordSvg(id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g transform="translate(7 5) rotate(-45) scale(0.5) translate(-20.6 -2)">${inner}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 5, crosshair`;
}
