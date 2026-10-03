import type { GenParams } from '../../core/params';
import { ExtensionRegistry } from '../../core/registry';
import type { Placement } from '../plan';
import type { Units } from '../units';

/** A mountain-like shape in art pixels. Columns run x0 .. x0 + tops.length - 1. */
export interface Profile {
  x0: number;
  /** Silhouette top per column (art y); artH where the shape is absent. */
  tops: Float32Array;
  /** Inner contour layers, same columns; never above the silhouette; artH where absent. */
  layers: Float32Array[];
  /** Art y of the shape's foot. */
  base: number;
  peakX: number;
  peakY: number;
}

export interface ShapeCtx {
  u: Units;
  params: GenParams;
  base: number;
}

/** One kind of shape. Drop a file into gen/shapes/ that calls registerShape(). */
export interface Shape {
  name: string;
  build(p: Placement, ctx: ShapeCtx): Profile;
}

export const shapes = new ExtensionRegistry<Shape>('shape', (s) => s.name);

export function registerShape(s: Shape): Shape {
  return shapes.register(s);
}
