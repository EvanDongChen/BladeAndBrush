import { layeredMountain } from './layered';
import { registerShape } from './registry';

/** A shan-shui mountain: nested contour layers under a rounded, noise-shaped silhouette. */
registerShape({ name: 'peak', build: (p, ctx) => layeredMountain(p, ctx) });
