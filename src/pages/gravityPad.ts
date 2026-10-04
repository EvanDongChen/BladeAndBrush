/**
 * The gravity gauge on the level page, the wind compass's partner: drag the marker up or down
 * the scale (down is a stronger pull down, above the zero line things fly up) and watch the drops
 * beside it fall, float or rise at that gravity. Double-click (or press 0) to reset to normal;
 * arrow keys step it. Presentation only: it reports whole numbers in [min, max].
 */
import { h } from './ui';

export interface GravityPad {
  node: HTMLElement;
  /** Set the marker without reporting it. */
  set(v: number): void;
  /** Advance and redraw the drops; call once per frame. */
  frame(dtMs: number): void;
}

const W = 92;
const H = 128;
const TOP = 12;
const BOTTOM = H - 12;
const TRACK_X = 22;

export function gravityPad(initial: number, range: { min: number; max: number; normal: number }, onChange: (v: number) => void): GravityPad {
  const { min, max, normal } = range;
  const canvas = h('canvas', { class: 'nature-dial gravity-dial', tabindex: 0, role: 'slider', 'aria-label': 'Gravity', 'aria-valuemin': min, 'aria-valuemax': max });
  const shown = h('output', { class: 'nature-value' });
  const word = h('span', { class: 'nature-word' });
  const node = h(
    'div',
    { class: 'nature-pad' },
    canvas,
    h(
      'div',
      { class: 'nature-info' },
      h('span', { class: 'nature-title' }, 'Gravity'),
      shown,
      word,
      h('span', { class: 'nature-hint' }, 'Drag the bead. Above the line, things fly up.'),
    ),
  );
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');

  let value = initial;
  // drops: fixed columns, staggered heights, a little variety in speed
  const drops = Array.from({ length: 12 }, (_, i) => ({ x: 40 + (i % 6) * 9 + (i >= 6 ? 4 : 0), y: TOP + ((i * 0.618) % 1) * (BOTTOM - TOP), k: 0.75 + ((i * 0.37) % 0.5) }));

  /** y on the scale for a gravity value: the top is the strongest upward pull. */
  const yOf = (v: number) => TOP + ((v - min) / (max - min)) * (BOTTOM - TOP);

  function describe(): void {
    word.textContent =
      value === 0 ? 'weightless' : value < 0 ? 'upside down' : value === normal ? 'normal' : value < normal ? 'light' : value >= normal + 4 ? 'crushing' : 'heavy';
    shown.textContent = value === 0 ? 'Float' : `${value < 0 ? '↑' : '↓'} ${Math.abs(value)}`;
    canvas.setAttribute('aria-valuenow', String(value));
    canvas.setAttribute('aria-valuetext', `${shown.textContent}, ${word.textContent}`);
  }

  function update(v: number, report: boolean): void {
    const next = Math.max(min, Math.min(max, Math.round(v)));
    const changed = next !== value;
    value = next;
    describe();
    if (report && changed) onChange(value);
  }

  const fromPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    update(min + ((y - TOP) / (BOTTOM - TOP)) * (max - min), true);
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
  canvas.addEventListener('dblclick', () => update(normal, true));
  canvas.addEventListener('keydown', (e) => {
    if (e.key === '0') update(normal, true);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') update(value - 1, true);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') update(value + 1, true);
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
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // the scale: a track with a tick per step and a dashed zero line across the gauge
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.globalAlpha = 0.25;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(TRACK_X, TOP);
    g.lineTo(TRACK_X, BOTTOM);
    g.stroke();
    g.lineWidth = 1;
    for (let v = min; v <= max; v++) {
      const y = yOf(v);
      const big = v === 0 || v === min || v === max || v === normal;
      g.beginPath();
      g.moveTo(TRACK_X - (big ? 5 : 3), y);
      g.lineTo(TRACK_X, y);
      g.stroke();
    }
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(TRACK_X, yOf(0));
    g.lineTo(W - 4, yOf(0));
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.55;
    g.font = '9px serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText('↑', TRACK_X - 8, TOP + 2);
    g.fillText('0', TRACK_X - 8, yOf(0));
    g.fillText('↓', TRACK_X - 8, BOTTOM - 2);
    // drops falling, floating or rising at this gravity
    g.globalAlpha = value === 0 ? 0.35 : 0.3 + 0.05 * Math.abs(value);
    const tail = value === 0 ? 0 : Math.min(10, 1.5 * Math.abs(value));
    const dir = value > 0 ? 1 : -1;
    g.lineCap = 'round';
    g.lineWidth = 2;
    for (const d of drops) {
      g.beginPath();
      g.moveTo(d.x, d.y - dir * tail * d.k);
      g.lineTo(d.x, d.y + 0.01);
      g.stroke();
    }
    // the marker: a red bead on the track with a pointer toward the drops
    const my = yOf(value);
    g.globalAlpha = 1;
    g.fillStyle = seal;
    g.beginPath();
    g.arc(TRACK_X, my, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(TRACK_X + 8, my - 4);
    g.lineTo(TRACK_X + 13, my);
    g.lineTo(TRACK_X + 8, my + 4);
    g.closePath();
    g.fill();
  }

  describe();
  return {
    node,
    set: (v) => update(v, false),
    frame: (dtMs) => {
      // pixels per second: proportional to the pull, and a slow drift up when weightless (as in the sim)
      const speed = value === 0 ? -6 : value * 16;
      const d = (dtMs / 1000) * speed;
      for (const p of drops) {
        p.y += d * p.k;
        if (p.y > BOTTOM) p.y -= BOTTOM - TOP;
        else if (p.y < TOP) p.y += BOTTOM - TOP;
      }
      draw();
    },
  };
}
