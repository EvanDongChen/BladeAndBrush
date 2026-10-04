/**
 * The audio engine: owns the AudioContext, mixes music, ambience and effects, and keeps the music
 * following the painting. It reads the World but never changes it, so replays stay exact.
 *
 * When a painting is generated (attach), its own song (song.ts) plays once from the start while the
 * scroll unrolls. After the song's last note has rung, the endless composer takes over and follows
 * the live World, so the music keeps answering what the player does to the painting.
 *
 * Browsers only allow sound after a click or key press, so nothing is created until `enable()` or
 * the first gesture armed with `armOnGesture()`. Mute is remembered in localStorage.
 */
import type { Blueprint } from '../core/blueprint';
import type { GameEvents } from '../core/events';
import { Rng } from '../core/rng';
import type { World } from '../core/world';
import { Composer, fitRange, type Voice } from './composer';
import { readLandscape, STEPS, type Landscape } from './profile';
import { songFor, type Song } from './song';
import { chime, crackle, dizi, erhu, gong, noiseBuffer, playNote, pluckString, prepareStrings, thud, tick, whoosh } from './synth';
import { degreeToMidi, midiToHz, tempoBpm } from './theory';

const PREF_KEY = 'bb-sound';
/** Schedule notes this far ahead of the audio clock, in seconds. */
const LOOKAHEAD = 0.6;
const PUMP_MS = 100;
/** Read the painting again every this many steps, so the music follows what the player does. */
const REREAD_STEPS = 2;
/** Beats of quiet between the end of the painting's song and the endless music. */
const SONG_GAP = 2;

/** Where each instrument sits, left (-1) to right (1), as if the ensemble sat in a half circle. */
const PAN: Record<Voice, number> = {
  guzheng: -0.3,
  guqin: -0.05,
  harmonic: 0.05,
  pipa: 0.3,
  dizi: 0.2,
  erhu: 0.1,
  chime: 0.4,
  muyu: 0.35,
  drum: -0.15,
  gong: 0,
};

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
  /** One input per instrument, panned into its seat, feeding the music bus. */
  seats: Map<Voice, AudioNode>;
}

/** The painting's song while it plays: when it started and the next note to schedule. */
interface SongPlay {
  song: Song;
  beatSec: number;
  /** Audio-clock time of beat 0, or -1 until sound is allowed. */
  t0: number;
  next: number;
}

export class AudioEngine {
  muted = readPref();

  private ctx: AudioContext | null = null;
  private nodes: Nodes | null = null;
  private world: World | null = null;
  private composer: Composer | null = null;
  private land: Landscape | null = null;
  private song: SongPlay | null = null;
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
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.nodes = this.build(ctx);
      // the browser may hold the context suspended until a gesture: start the music the moment it runs
      ctx.addEventListener('statechange', () => {
        if (this.running && !this.muted) this.startScheduler();
        this.emitChange();
      });
    }
    await this.ctx.resume();
    this.applyMute();
    this.startScheduler();
    this.emitChange();
  }

  /**
   * Try to start sound right away (some browsers allow it, e.g. after a click on the previous page),
   * and otherwise on the first click, tap or key press anywhere. Not if the player muted it.
   */
  armOnGesture(): void {
    if (typeof window === 'undefined') return;
    const kinds = ['pointerdown', 'click', 'touchend', 'keydown'] as const;
    const go = () => {
      if (this.running) for (const k of kinds) window.removeEventListener(k, go);
      else if (!this.muted) void this.enable();
    };
    for (const k of kinds) window.addEventListener(k, go);
    if (!this.muted) void this.enable();
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

  /**
   * A new painting: compose its song from the blueprint and play it from the start, then follow
   * the world (its peaks, dips and elements make the music, its events make the effects).
   */
  attach(world: World, bp: Blueprint): void {
    this.detach();
    const seed = bp.seed;
    const song = songFor(bp);
    this.world = world;
    this.composer = new Composer(seed);
    this.composer.mode = song.mode;
    this.song = { song, beatSec: 60 / song.bpm, t0: -1, next: 0 };
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
      on('levelFail', () => this.sfx('fail', 0, (t, o) => this.failSigh(t, o))),
    );
    if (this.running && !this.muted) this.startScheduler();
  }

  detach(): void {
    this.stopScheduler();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.world = null;
    this.composer = null;
    this.song = null;
  }

  /** The song the current painting plays when it is generated (null once it has finished). */
  get currentSong(): Song | null {
    return this.song?.song ?? null;
  }

  /** Where the music is on the scroll, 0..1 across the picture (null when silent). */
  playhead(): number | null {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.muted || this.timer === 0) return null;
    const now = ctx.currentTime;
    const sp = this.song;
    if (sp && sp.t0 >= 0) {
      const beat = (now - sp.t0) / sp.beatSec;
      const [a, b] = sp.song.scroll;
      return beat >= a && beat < b ? (beat - a) / (b - a) : null;
    }
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
    const seats = new Map<Voice, AudioNode>();
    for (const [voice, pan] of Object.entries(PAN) as [Voice, number][]) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(music);
      seats.set(voice, p);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    for (const bus of [music, sfx]) {
      bus.connect(master);
      bus.connect(reverb);
    }
    reverb.connect(wet).connect(master);

    return { master, music, sfx, seats, brook: this.loopNoise(ctx, 'bandpass', 900, 0.7, master), wind: this.loopNoise(ctx, 'lowpass', 420, 0.5, master) };
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
    this.nodes.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  private startScheduler(): void {
    if (!this.ctx || !this.world || !this.composer || this.muted || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.2;
    const sp = this.song;
    if (sp && sp.t0 < 0) {
      prepareStrings(this.ctx, sp.song.notes); // render every plucked note before the first one sounds
      sp.t0 = this.ctx.currentTime + 0.15;
    }
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
  }

  private stopScheduler(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    if (this.song && this.song.t0 >= 0) this.song = null; // muted mid-song: come back to the endless music
  }

  private pump(): void {
    const ctx = this.ctx;
    const world = this.world;
    const composer = this.composer;
    const nodes = this.nodes;
    if (!ctx || !world || !composer || !nodes) return;
    const now = ctx.currentTime;

    const sp = this.song;
    if (sp) {
      const notes = sp.song.notes;
      while (sp.next < notes.length && sp.t0 + notes[sp.next].beat * sp.beatSec < now + LOOKAHEAD) {
        const n = notes[sp.next++];
        playNote(ctx, nodes.seats.get(n.voice) ?? nodes.music, n, sp.t0 + n.beat * sp.beatSec, sp.beatSec);
      }
      const after = sp.t0 + (sp.song.length + SONG_GAP) * sp.beatSec;
      if (sp.next < notes.length || now + LOOKAHEAD < after) {
        this.ambience(now);
        return;
      }
      this.song = null; // the song has rung out: the endless music starts where it left off
      this.nextTime = after;
    }

    while (this.nextTime < now + LOOKAHEAD) {
      if (!this.land || this.stepIndex % REREAD_STEPS === 0) this.land = readLandscape(world);
      const land = this.land;
      this.beatSec = 60 / tempoBpm(land);
      for (const note of composer.step(land, this.stepIndex)) {
        playNote(ctx, nodes.seats.get(note.voice) ?? nodes.music, note, this.nextTime + note.beat * this.beatSec, this.beatSec);
      }
      this.started.push({ t: this.nextTime, idx: this.stepIndex });
      if (this.started.length > 12) this.started.shift();
      this.nextTime += this.beatSec;
      this.stepIndex++;
    }
    this.ambience(now);
  }

  /** Ambience follows what is on the scroll: a brook for water, wind for height, crackle for fire. */
  private ambience(now: number): void {
    const ctx = this.ctx!;
    const nodes = this.nodes!;
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
        pluckString(ctx, out, t + 0.02, 'pipa', fitRange('pipa', c.melodyMidi(degree)), 0.8, 1.2, -2);
      }
    });
  }

  private droplet(t: number, out: AudioNode): void {
    const c = this.composer;
    if (!c) return;
    chime(this.ctx!, out, t, midiToHz(fitRange('chime', c.melodyMidi(9 + this.rng.int(5)) + 12)), 0.5, 0.9);
  }

  /** A gong, a guzheng run up the scale, a long dizi note and the guqin's low tonic. */
  private winSting(t: number, out: AudioNode): void {
    const c = this.composer;
    const ctx = this.ctx!;
    gong(ctx, out, t, 1, midiToHz(c ? c.root - 12 : 38));
    if (!c) return;
    for (let k = 0; k < 6; k++) pluckString(ctx, out, t + 0.25 + k * 0.14, 'guzheng', degreeToMidi(c.root + 12, c.mode, k), 0.7, 1.6);
    dizi(ctx, out, t + 1.1, midiToHz(degreeToMidi(c.root + 24, c.mode, 4)), 0.8, 3.5, 2);
    pluckString(ctx, out, t + 0.25, 'guqin', c.root - 12, 0.8, 4);
  }

  /** The painting does not match the poem: the erhu sighs down a step. */
  private failSigh(t: number, out: AudioNode): void {
    const c = this.composer;
    if (!c) return;
    const ctx = this.ctx!;
    erhu(ctx, out, t, midiToHz(degreeToMidi(c.root + 12, c.mode, 6)), 0.6, 0.7);
    erhu(ctx, out, t + 0.7, midiToHz(degreeToMidi(c.root + 12, c.mode, 5)), 0.55, 1.6, 2);
  }

  private emitChange(): void {
    for (const fn of this.listeners) fn();
  }
}

/** The one engine every page shares. Making it touches nothing until enable() runs. */
export const audio = new AudioEngine();
