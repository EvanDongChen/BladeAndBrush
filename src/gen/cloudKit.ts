import type { StrokeInfo } from '../core/blueprint';
import { elementId } from './setpieceKit';

/**
 * Ask for a cloud centred on (cx, cy), half sizes in cells. Clouds are not painted: the sim grows
 * one (its CLOUD placer) when the frontier reaches it, and the wind carries it across the scroll.
 * Returns the cloud's object id, or 0 if there is no cloud element.
 */
export function addCloud(
  newStroke: (info: Omit<StrokeInfo, 'id'>) => number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): number {
  const cloud = elementId('cloud');
  if (cloud === 0) return 0;
  const x = Math.round(cx);
  const y = Math.round(cy);
  const hw = Math.max(4, Math.round(halfW));
  const hh = Math.max(2, Math.round(halfH));
  // revealed as soon as the frontier reaches its left end, so it can drift in from there
  return newStroke({ kind: 'cloud', bbox: [x - hw, y - hh * 2, x + hw, y + hh], anchor: [x, y], tags: ['cloud'], spawn: { el: cloud, variant: hw, face: hh } });
}
