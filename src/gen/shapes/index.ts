import { shapes, type Shape } from './registry';

// Every shape file in this folder registers itself (one file per shape, like core's registries).
import.meta.glob(['./*.ts', '!./index.ts'], { eager: true });

export { registerShape, shapes, type Profile, type Shape, type ShapeCtx } from './registry';

export function getShape(name: string): Shape {
  const s = shapes.get(name);
  if (!s) throw new Error(`Unknown shape "${name}"`);
  return s;
}
