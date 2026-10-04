import type { ArtView } from './blueprint';
import { flagOn } from './config';
import type { LevelDims } from './constants';
import { byOrder, ExtensionRegistry } from './registry';
import type { World } from './world';

export type { ArtView };

/** Per-frame inputs from the page, beyond the world itself. */
export interface RenderState {
  /** Column the frontier reveal has reached (draws the brush head). */
  frontierX?: number;
  /** Brush outline in cell coordinates. */
  cursor?: { x: number; y: number; r: number } | null;
  /** Hybrid art layer (section 3.8), if the blueprint has one. */
  art?: ArtView;
}

export interface RenderCtx extends RenderState {
  g: CanvasRenderingContext2D;
  world: World;
  /** Little-endian RGBA view over the frame's ImageData, one entry per cell. */
  pixels: Uint32Array;
}

/**
 * One slice of the frame. 'pixels' layers write into `pixels` (all of them, then ONE
 * putImageData); 'canvas' layers then draw with `g` on top. Drop a file into core/layers/.
 */
export interface Layer {
  name: string;
  label?: string;
  order: number;
  kind: 'pixels' | 'canvas';
  /** Debug layers start switched off. */
  debug?: boolean;
  /** Kill switch name in core/config.ts flags. */
  flag?: string;
  draw(rc: RenderCtx): void;
}

export const layers = new ExtensionRegistry<Layer>('layer', (l) => l.name);

export function registerLayer(l: Layer): Layer {
  return layers.register(l);
}

/** World -> ImageData -> canvas, at one canvas pixel per cell (scale up with CSS, pixelated). */
export class Renderer {
  readonly g: CanvasRenderingContext2D;
  private image!: ImageData;
  private pixels!: Uint32Array;
  /** Per-layer on/off overrides. Default: on, or off for debug layers. */
  readonly toggles = new Map<string, boolean>();
  private sorted: Layer[] = [];
  private sortedVersion = -1;
  /** Cell-resolution canvas for the pixel layers when scale > 1 (upscaled onto the main canvas). */
  private small: HTMLCanvasElement | null = null;
  private smallG: CanvasRenderingContext2D | null = null;

  /**
   * `scale` = canvas pixels per cell. Pixel layers still write one pixel per cell; canvas layers
   * draw in cell coordinates (the context is pre-scaled). Scale 1 is the original behavior.
   */
  constructor(
    readonly canvas: HTMLCanvasElement,
    dims: LevelDims,
    readonly scale = 1,
  ) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D context not available');
    this.g = g;
    this.resize(dims);
  }

  resize(dims: LevelDims): void {
    this.canvas.width = dims.w * this.scale;
    this.canvas.height = dims.h * this.scale;
    this.image = this.g.createImageData(dims.w, dims.h);
    this.pixels = new Uint32Array(this.image.data.buffer);
    if (this.scale !== 1) {
      this.small = document.createElement('canvas');
      this.small.width = dims.w;
      this.small.height = dims.h;
      this.smallG = this.small.getContext('2d');
    }
  }

  isOn(layer: Layer): boolean {
    return flagOn(layer.flag) && (this.toggles.get(layer.name) ?? !layer.debug);
  }

  draw(world: World, state: RenderState = {}): void {
    if (world.w * this.scale !== this.canvas.width || world.h * this.scale !== this.canvas.height) this.resize(world);
    if (this.sortedVersion !== layers.version) {
      this.sorted = layers.all().sort(byOrder);
      this.sortedVersion = layers.version;
    }
    const rc: RenderCtx = { ...state, g: this.g, world, pixels: this.pixels };
    for (const l of this.sorted) if (l.kind === 'pixels' && this.isOn(l)) l.draw(rc);
    if (this.scale === 1 || !this.small || !this.smallG) {
      this.g.putImageData(this.image, 0, 0);
    } else {
      this.smallG.putImageData(this.image, 0, 0);
      this.g.setTransform(1, 0, 0, 1, 0, 0);
      this.g.imageSmoothingEnabled = false;
      this.g.drawImage(this.small, 0, 0, this.canvas.width, this.canvas.height);
    }
    this.g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    for (const l of this.sorted) if (l.kind === 'canvas' && this.isOn(l)) l.draw(rc);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
