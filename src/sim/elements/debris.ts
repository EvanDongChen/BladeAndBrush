import { ELEMENTS, registerElement, shade } from '../../core/elements';

/**
 * A loose cell in flight (earth, ash, water... thrown by push). aux holds the element it really
 * is and life holds that cell's shade, so it is drawn as itself and lands back as itself.
 */
export const DEBRIS = 12;

registerElement({
  id: DEBRIS,
  name: 'debris',
  kind: 'projectile',
  density: 50,
  flammability: 0,
  solidForScan: false,
  color: (c) => {
    const def = ELEMENTS[c.aux];
    if (!def || c.aux === DEBRIS) return shade(70, 66, 60, c.life);
    // draw as the carried element: borrow the (reused) view for one call
    const { el, aux } = c;
    c.el = aux;
    c.aux = c.life;
    const color = def.color(c);
    c.el = el;
    c.aux = aux;
    return color;
  },
});
