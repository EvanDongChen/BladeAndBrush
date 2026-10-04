/**
 * The audio engine: owns the AudioContext, mixes music, ambience and effects, and keeps the music
 * following the painting. It reads the World but never changes it, so replays stay exact.
 *
 * Browsers only allow sound after a click or key press, so nothing is created until `enable()` or
 * the first gesture armed with `armOnGesture()`. Mute is remembered in localStorage.
 */
import type { GameEvents } from '../core/events';
import { Rng } from '../core/rng';
import type { World } from '../core/world';
import { Composer } from './composer';
import { readLandscape, STEPS, type Landscape } from './profile';
import { bass, chime, crackle, flute, gong, playNote, pluck, thud, tick, whoosh, noiseBuffer } from './synth';
import { degreeToMidi, midiToHz, tempoBpm } from './theory';

const PREF_KEY = 'bb-sound';
/** Schedule notes this far ahead of the audio clock, in seconds. */
const LOOKAHEAD = 0.6;
const PUMP_MS = 100;
/** Read the painting again every this many steps, so the music follows what the player does. */
const REREAD_STEPS = 2;

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'off';
  } catch {
    return false;
  }
}

function writePref(muted: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, muted ? 'off' : 'on');
  } catch {
    /* private mode: just do not remember it */
  }
}

interface Nodes {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  brook: GainNode;
  wind: GainNode;
}

export class AudioEngine {
  muted = readPref();

  private ctx: AudioContext | null = null;
  private nodes: Nodes | null = null;
  private world: World | null = null;
  private composer: Composer | null = null;
  private land: Landscape | null = null;
  private rng = new Rng(1);
  private timer = 0;
  private stepIndex = 0;
  private nextTime = 0;
  private beatSec = 0.8;
  private started: { t: number; idx: number }[] = [];
  private lastSfx = new Map<string, number>();
  private unsubs: (() => void)[] = [];
  private listeners = new Set<() => void>();

  /** True once the browser has let us make sound. */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Called when mute changes or sound becomes available, so a button can update itself. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Create the context and start playing. Must run from a user gesture the first time. */
  async enable(): Promise<void> {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.nodes = this.build(this.ctx);
    }
    await this.ctx.resume();
    this.applyMute();
    this.startScheduler();
    this.emitChange();
  }

  /** Start sound on the first click, tap or key press anywhere (unless the player muted it). */
  armOnGesture(): void {
    if (typeof window === 'undefined') return;
    const go = () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      if (!this.muted) void this.enable();
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writePref(muted);
    if (muted) {
      this.stopScheduler();
      this.applyMute();
      this.emitChange();
    } else {
      void this.enable(); // a click on the toggle is a gesture, so this is allowed
    }
  }

  toggle(): void {
    this.setMuted(!this.muted);
  }

  /** Follow a world: its peaks, dips and elements make the music, its events make the effects. */
  attach(world: World, seed: number): void {
    this.detach();
    this.world = world;
    this.composer = new Composer(seed);
    this.rng = new Rng(seed ^ 0x61756469);
    this.land = readLandscape(world);
    this.stepIndex = 0;
    this.started = [];
    const on = world.events.on.bind(world.events);
    this.unsubs.push(
      on('cut', () => this.sfx('cut', 0.06, (t, o) => tick(this.ctx!, o, t, 0.6))),
      on('lineFire', (e) => this.onLine(e)),
      on('impact', (e) => this.sfx('impact', 0.08, (t, o) => thud(this.ctx!, o, t, Math.min(1, e.strength / 1500)))),
      on('ignite', () => this.sfx('ignite', 0.15, (t, o) => crackle(this.ctx!, o, t, this.rng))),
      on('splash', () => this.sfx('splash', 0.1, (t, o) => this.droplet(t, o))),
      on('levelWin', () => this.sfx('win', 0, (t, o) => this.winSting(t, o))),
    );
    if (this.running && !this.muted) this.startScheduler();
  }

  detach(): void {
    this.stopScheduler();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.world = null;
    this.composer = null;
  }

  /** Where the music is on the scroll, 0..1 across the picture (null when silent). */
  playhead(): number | null {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.muted || this.timer === 0) return null;
    const now = ctx.currentTime;
    let cur = this.started[0];
    for (const s of this.started) if (s.t <= now) cur = s;
    if (!cur || cur.t > now) return null;
    const frac = Math.min(1, (now - cur.t) / this.beatSec);
    return (((cur.idx % STEPS) + frac) / STEPS) % 1;
  }

  // ---- internals ----

  private build(ctx: AudioContext): Nodes {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    const music = ctx.createGain();
    music.gain.value = 0.85;
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    for (const bus of [music, sfx]) {
      bus.connect(master);
      bus.connect(reverb);
    }
    reverb.connect(wet).connect(master);

    return { master, music, sfx, brook: this.loopNoise(ctx, 'bandpass', 900, 0.7, master), wind: this.loopNoise(ctx, 'lowpass', 420, 0.5, master) };
  }

  /** A hall: two seconds of noise that fades out, a different one in each ear. */
  private impulse(ctx: AudioContext): AudioBuffer {
    const rng = new Rng(0x7265766572);
    const len = Math.floor(ctx.sampleRate * 2.4);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /** A looping noise bed through a filter; returns the gain that sets how loud it is. */
  private loopNoise(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number, out: AudioNode): GainNode {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(out);
    src.start();
    return g;
  }

  private applyMute(): void {
    if (!this.ctx || !this.nodes) return;
    this.nodes.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.08);
  }

  private startScheduler(): void {
    if (!this.ctx || !this.world || !this.composer || this.muted || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
  }

  private stopScheduler(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private pump(): void {
    const ctx = this.ctx;
    const world = this.world;
    const composer = this.composer;
    const nodes = this.nodes;
    if (!ctx || !world || !composer || !nodes) return;
    const now = ctx.currentTime;

    while (this.nextTime < now + LOOKAHEAD) {
      if (!this.land || this.stepIndex % REREAD_STEPS === 0) this.land = readLandscape(world);
      const land = this.land;
      this.beatSec = 60 / tempoBpm(land);
      for (const note of composer.step(land, this.stepIndex)) {
        playNote(ctx, nodes.music, note, this.nextTime + note.beat * this.beatSec, this.beatSec);
      }
      this.started.push({ t: this.nextTime, idx: this.stepIndex });
      if (this.started.length > 12) this.started.shift();
      this.nextTime += this.beatSec;
      this.stepIndex++;
    }

    // Ambience follows what is on the scroll: a brook for water, wind for height, crackle for fire.
    const land = this.land;
    if (land) {
      nodes.brook.gain.setTargetAtTime(Math.sqrt(land.water) * 0.2, now, 0.6);
      nodes.wind.gain.setTargetAtTime(0.02 + land.mean * 0.07, now, 0.8);
      if (this.rng.chance(land.fire * 0.7)) crackle(ctx, nodes.sfx, now + this.rng.range(0, PUMP_MS / 1000), this.rng, 0.5);
    }
  }

  /** Play an effect now, unless one of the same kind just played. */
  private sfx(key: string, minGap: number, fn: (t: number, out: AudioNode) => void): void {
    const ctx = this.ctx;
    if (!ctx || !this.nodes || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastSfx.get(key) ?? -1) < minGap) return;
    this.lastSfx.set(key, now);
    fn(now + 0.005, this.nodes.sfx);
  }

  /** A released blade whooshes, and plucks a note from how high on the scroll it started. */
  private onLine(e: GameEvents['lineFire']): void {
    this.sfx('line', 0.1, (t, out) => {
      const ctx = this.ctx!;
      whoosh(ctx, out, t, Math.min(1.5, e.power));
      const c = this.composer;
      const h = this.world?.h ?? 1;
      if (c) {
        const degree = Math.round((1 - e.y0 / h) * 9) + 2;
        pluck(ctx, out, t + 0.02, midiToHz(c.melodyMidi(degree)), 0.8, 1.2, -2);
      }
    });
  }

  private droplet(t: number, out: AudioNode): void {
    const c = this.composer;
    if (!c) return;
    chime(this.ctx!, out, t, midiToHz(c.melodyMidi(9 + this.rng.int(5)) + 12), 0.5, 0.9);
  }

  /** A gong, a rising run up the scale, and a long flute note. */
  private winSting(t: number, out: AudioNode): void {
    const c = this.composer;
    const ctx = this.ctx!;
    gong(ctx, out, t, 1, midiToHz(c ? c.root - 12 : 38));
    if (!c) return;
    for (let k = 0; k < 6; k++) pluck(ctx, out, t + 0.25 + k * 0.14, midiToHz(degreeToMidi(c.root + 12, c.mode, k * 1)), 0.7, 1.6);
    flute(ctx, out, t + 1.1, midiToHz(degreeToMidi(c.root + 12, c.mode, 9)), 0.8, 3.5);
    bass(ctx, out, t + 0.25, midiToHz(c.root), 0.8, 4);
  }

  private emitChange(): void {
    for (const fn of this.listeners) fn();
  }
}

/** The one engine every page shares. Making it touches nothing until enable() runs. */
export const audio = new AudioEngine();
