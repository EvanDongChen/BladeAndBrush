/**
 * The wind compass on the level page: drag the arrow anywhere in the circle to set the wind's
 * direction and strength (the rim is full strength, the middle is calm). Streaks drift across the
 * dial the way the wind blows. Double-click (or press 0) for calm; arrow keys nudge it.
 * Presentation only: it reports (x, y) in -1..1 with y > 0 blowing down, and the page writes them
 * into the world's `wind` and `windY` params.
 */
import { h } from './ui';

export interface WindPad {
  node: HTMLElement;
  /** Set the arrow without reporting it (e.g. when the page restarts). */
  set(x: number, y: number): void;
  /** Advance and redraw the streaks; call once per frame. */
  frame(dtMs: number): void;
}

const SIZE = 128;
const R = SIZE / 2 - 10; // radius of the full-strength rim, in CSS pixels
const NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export function windPad(initial: { x: number; y: number }, onChange: (x: number, y: number) => void): WindPad {
  const canvas = h('canvas', { class: 'nature-dial wind-dial', tabindex: 0, role: 'slider', 'aria-label': 'Wind direction and strength' });
  const value = h('output', { class: 'nature-value' });
  const word = h('span', { class: 'nature-word' });
  const node = h(
    'div',
    { class: 'nature-pad' },
    canvas,
    h(
      'div',
      { class: 'nature-info' },
      h('span', { class: 'nature-title' }, 'Wind'),
      value,
      word,
      h('span', { class: 'nature-hint' }, 'Drag the arrow to aim it. Double-click for calm.'),
    ),
  );
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;
  const g = canvas.getContext('2d');

  let wx = initial.x;
  let wy = initial.y;
  // streaks: fixed pseudo-random spots that drift with the wind and wrap around the dial
  const streaks = Array.from({ length: 22 }, (_, i) => ({ u: ((i * 0.618) % 1) * 2 - 1, v: ((i * 0.377 + 0.13) % 1) * 2 - 1, k: 0.6 + ((i * 0.29) % 0.8) }));

  function describe(): void {
    const s = Math.hypot(wx, wy);
    if (s < 0.05) {
      value.textContent = 'Calm';
      word.textContent = 'still air';
    } else {
      const a = Math.atan2(wy, wx); // screen angle, y down
      const name = NAMES[(Math.round(a / (Math.PI / 4)) + 8) % 8];
      value.textContent = `${name} ${Math.round(s * 100)}%`;
      word.textContent = s < 0.35 ? 'a breeze' : s < 0.7 ? 'strong wind' : 'a gale';
    }
    canvas.setAttribute('aria-valuetext', `${value.textContent}, ${word.textContent}`);
  }

  function update(x: number, y: number, report: boolean): void {
    let s = Math.hypot(x, y);
    if (s > 1) (x /= s), (y /= s), (s = 1);
    if (s < 0.06) (x = 0), (y = 0); // snap to calm near the middle
    wx = Math.round(x * 100) / 100;
    wy = Math.round(y * 100) / 100;
    describe();
    if (report) onChange(wx, wy);
  }

  const fromPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    update((e.clientX - r.left - r.width / 2) / R, (e.clientY - r.top - r.height / 2) / R, true);
  };
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    fromPointer(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) fromPointer(e);
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('pointercancel', () => (dragging = false));
  canvas.addEventListener('dblclick', () => update(0, 0, true));
  canvas.addEventListener('keydown', (e) => {
    const step = 0.1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === '0') update(0, 0, true);
    else if (moves[e.key]) update(wx + moves[e.key][0], wy + moves[e.key][1], true);
    else return;
    e.preventDefault();
    e.stopPropagation(); // the page's number keys pick abilities
  });

  let ink = '';
  let seal = '';
  function draw(): void {
    if (!g) return;
    if (!ink && node.isConnected) {
      const css = getComputedStyle(node); // read the theme once, not every frame
      ink = css.getPropertyValue('--ink').trim() || '#26221e';
      seal = css.getPropertyValue('--seal').trim() || '#b5262b';
    }
    const c = SIZE / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    // rings and cross hairs
    g.strokeStyle = ink;
    g.globalAlpha = 0.18;
    g.lineWidth = 1;
    for (const f of [1, 0.66, 0.33]) {
      g.beginPath();
      g.arc(c, c, R * f, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(c - R, c);
    g.lineTo(c + R, c);
    g.moveTo(c, c - R);
    g.lineTo(c, c + R);
    g.stroke();
    // compass letters
    g.globalAlpha = 0.5;
    g.fillStyle = ink;
    g.font = '9px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', c, 5);
    g.fillText('S', c, SIZE - 5);
    g.fillText('W', 5, c);
    g.fillText('E', SIZE - 5, c);
    // streaks drifting with the wind, clipped to the dial
    const s = Math.hypot(wx, wy);
    if (s > 0) {
      g.save();
      g.beginPath();
      g.arc(c, c, R, 0, Math.PI * 2);
      g.clip();
      g.strokeStyle = ink;
      g.lineCap = 'round';
      g.lineWidth = 1;
      const ux = wx / s;
      const uy = wy / s;
      const len = 4 + 10 * s;
      for (const p of streaks) {
        g.globalAlpha = 0.15 + 0.25 * s;
        const x = c + p.u * R;
        const y = c + p.v * R;
        g.beginPath();
        g.moveTo(x - ux * len * p.k, y - uy * len * p.k);
        g.lineTo(x, y);
        g.stroke();
      }
      g.restore();
    }
    // the arrow: from the middle to the chosen point
    g.globalAlpha = 1;
    const tx = c + wx * R;
    const ty = c + wy * R;
    if (s > 0) {
      g.strokeStyle = seal;
      g.fillStyle = seal;
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(tx, ty);
      g.stroke();
      const ux = wx / s;
      const uy = wy / s;
      const hd = 8;
      g.beginPath();
      g.moveTo(tx + ux * 3, ty + uy * 3);
      g.lineTo(tx - ux * hd - uy * hd * 0.6, ty - uy * hd + ux * hd * 0.6);
      g.lineTo(tx - ux * hd + uy * hd * 0.6, ty - uy * hd - ux * hd * 0.6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = s > 0 ? seal : ink;
    g.beginPath();
    g.arc(c, c, 3, 0, Math.PI * 2);
    g.fill();
  }

  update(wx, wy, false);
  return {
    node,
    set: (x, y) => update(x, y, false),
    frame: (dtMs) => {
      const s = Math.hypot(wx, wy);
      if (s > 0) {
        const d = (dtMs / 1000) * (0.4 + 1.4 * s);
        for (const p of streaks) {
          p.u += (wx / s) * d * p.k;
          p.v += (wy / s) * d * p.k;
          // wrap around inside the square that holds the dial
          if (p.u > 1.1) p.u -= 2.2;
          else if (p.u < -1.1) p.u += 2.2;
          if (p.v > 1.1) p.v -= 2.2;
          else if (p.v < -1.1) p.v += 2.2;
        }
      }
      draw();
    },
  };
}
