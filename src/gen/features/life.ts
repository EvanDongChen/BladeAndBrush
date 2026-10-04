import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { mountainsOf } from '../mountainStore';
import { elementId, isReserved, topOwner } from '../setpieceKit';

registerParam({ key: 'wildlife', label: 'Wildlife', min: 0, max: 1, step: 0.01, default: 0.5 });
registerParam({ key: 'wanderers', label: 'Wanderers', min: 0, max: 1, step: 0.01, default: 0.4 });

/**
 * Life in the painting: flowers on open ground, bamboo groves on the plateaus, butterflies over the
 * flowers, flocks of birds in the sky (Wildlife slider), and people wandering the plateaus
 * (Wanderers slider). None of it is painted: each is an object the sim grows or places when the
 * frontier gets there (core/objects.ts placers), so it shows as live cells. Stays out of the spans
 * a level's setpieces reserved (a village, a camp).
 */
registerFeature({
  name: 'life',
  label: 'Life',
  order: 30, // after everything that paints land, trees and setpieces
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const wild = Math.max(0, Math.min(1, params.wildlife ?? 0));
    const wander = Math.max(0, Math.min(1, params.wanderers ?? 0));
    if (wild <= 0 && wander <= 0) return;
    const el = { flower: elementId('flower'), bamboo: elementId('bamboo'), butterfly: elementId('butterfly'), bird: elementId('bird'), person: elementId('person') };
    const scale = dims.h / 256;
    const mountains = new Set(mountainsOf(bp).map((m) => m.id));
    const plateaus = new Set(mountainsOf(bp).filter((m) => m.slab).map((m) => m.id));

    /** Ground at column x: the top of a mountain or plateau, open to the sky, not reserved. */
    const ground = (x: number) => {
      if (x < 2 || x >= dims.w - 3 || isReserved(bp, x)) return null;
      const t = topOwner(bp, x);
      return t.plane >= 0 && mountains.has(t.owner) ? t : null;
    };
    /** Ground that stays within `rise` cells over x - r .. x + r (fairly level, all one piece of land). */
    const level = (x: number, r: number, rise: number, onPlateau: boolean) => {
      const here = ground(x);
      if (!here || (onPlateau && !plateaus.has(here.owner))) return null;
      for (let dx = -r; dx <= r; dx++) {
        const t = ground(x + dx);
        if (!t || t.owner !== here.owner || Math.abs(t.y - here.y) > rise) return null;
      }
      return here;
    };
    const spawn = (kind: string, e: number, x: number, y: number, variant?: number, face?: number) =>
      e !== 0 && newStroke({ kind, bbox: [x - 3, y - 6, x + 3, y], anchor: [x, y], tags: ['life'], spawn: { el: e, variant, face } });

    // flowers in patches on open ground
    const flowers: [number, number][] = [];
    for (let x = 4; x < dims.w - 4; x += 3 + rng.int(4)) {
      if (noise.n1(x * 0.02) > 0.25 + 0.5 * wild) continue; // patchy
      if (!rng.chance(0.55 * wild)) continue;
      const g = level(x, 1, 1, false);
      if (!g) continue;
      spawn('flower', el.flower, x, g.y, rng.int(4));
      flowers.push([x, g.y]);
    }

    // bamboo groves on plateaus: a spot of clear level ground on the slab, then a few stalks
    for (const m of mountainsOf(bp)) {
      if (!m.slab || !rng.chance(0.8 * wild)) continue;
      const x0 = Math.ceil(m.slab.x0 / (bp.art?.k ?? 1));
      const x1 = Math.floor(m.slab.x1 / (bp.art?.k ?? 1));
      for (let tries = 0; tries < 12; tries++) {
        const gx = x0 + rng.int(Math.max(1, x1 - x0 - 12));
        if (!level(gx, 1, 1, true)) continue;
        const stalks = 2 + rng.int(4);
        for (let s = 0, sx = gx; s < stalks; s++, sx += 4 + rng.int(3)) {
          const g = level(sx, 1, 1, true);
          if (!g) break;
          spawn('bamboo', el.bamboo, sx, g.y, Math.min(Math.round(rng.range(22, 45) * scale), g.y - 4));
        }
        break;
      }
    }

    // butterflies over some of the flowers
    for (const [x, y] of flowers) if (rng.chance(0.15 * wild)) spawn('butterfly', el.butterfly, x, y - 10 - rng.int(10), rng.int(6));

    // flocks of birds in the open sky
    const flocks = Math.round(wild * 4);
    for (let f = 0; f < flocks; f++) {
      const fx = dims.w * ((f + rng.range(0.2, 0.8)) / Math.max(1, flocks));
      const fy = dims.h * rng.range(0.08, 0.3);
      const face = rng.chance(0.5) ? 1 : -1;
      for (let b = 0, n = 2 + rng.int(3); b < n; b++) spawn('bird', el.bird, Math.round(fx + b * 9 * face), Math.round(fy + (b % 2) * 4), rng.int(4), face);
    }

    // people wandering the plateaus
    const people = Math.round(wander * 4);
    for (let k = 0, tries = 0; k < people && tries < 200; tries++) {
      const x = 6 + rng.int(dims.w - 12);
      const g = level(x, 3, 2, true);
      if (!g) continue;
      if (newStroke({ kind: 'person', bbox: [x - 3, g.y - 9, x + 3, g.y - 1], anchor: [x, g.y - 2], tags: ['wanderer'], spawn: { el: el.person, variant: rng.int(6) } })) k++;
    }
  },
});
