import type { LevelDims } from '../core/constants';

/** Painting units: the scroll is SCROLL_H units tall (the reference painting's scale). */
export const SCROLL_H = 800;

export interface Units {
  /** Art pixels per cell side. */
  k: number;
  widthUnits: number;
  cellsPerUnit: number;
  artPerUnit: number;
  artW: number;
  artH: number;
  toCell(u: number): number;
  toArt(u: number): number;
  artToUnit(px: number): number;
}

/** The one place that converts painting units to cells and art pixels. */
export function units(dims: LevelDims, k: number): Units {
  const cellsPerUnit = dims.h / SCROLL_H;
  const artPerUnit = cellsPerUnit * k;
  return {
    k,
    widthUnits: dims.w / cellsPerUnit,
    cellsPerUnit,
    artPerUnit,
    artW: dims.w * k,
    artH: dims.h * k,
    toCell: (u) => u * cellsPerUnit,
    toArt: (u) => u * artPerUnit,
    artToUnit: (px) => px / artPerUnit,
  };
}
