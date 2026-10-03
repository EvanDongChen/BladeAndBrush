// Fine: linted as if it lived in src/gen/. gen/ may import core/ and other gen/ files.
import { World } from '../core/world';
import { surfaceY } from './raster';

export const ok = [World, surfaceY];
