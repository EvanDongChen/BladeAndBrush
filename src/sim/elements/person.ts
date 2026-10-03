import { registerElement, rgba } from '../../core/elements';

/**
 * A person in a straw hat: 32 cells that stroll around, pause, climb small steps and run from
 * fire (see sim/behaviors/person.ts). Palette indices: hat, brim, skin, legs, walking staff, then
 * six robe colors by variant.
 */
export const PERSON = 18;

export const PERSON_PALETTE = [
  rgba(214, 182, 96), // 0 hat
  rgba(176, 140, 68), // 1 hat brim
  rgba(216, 178, 140), // 2 skin
  rgba(56, 48, 44), // 3 legs
  rgba(100, 72, 46), // 4 staff
  rgba(62, 82, 118), // 5.. robes: indigo
  rgba(156, 74, 50), // rust
  rgba(92, 114, 68), // moss
  rgba(112, 70, 96), // plum
  rgba(112, 112, 108), // grey
  rgba(180, 132, 58), // ochre
];

registerElement({
  id: PERSON,
  name: 'person',
  kind: 'projectile',
  density: 6,
  flammability: 0.45,
  solidForScan: false,
  color: (c) => PERSON_PALETTE[c.aux & 31] ?? rgba(255, 0, 255),
});
