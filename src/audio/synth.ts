/**
 * Instrument voices built from plain oscillators and noise, so the game needs no audio files:
 * a plucked guzheng-like string, a bamboo flute, a soft bass, a bell chime, a gong, and a few
 * sound-effect sounds. Every function schedules at a time `t` on any BaseAudioContext, so the same
 * code plays live and renders offline. They do not touch the World.
 */
import { Rng } from '../core/rng';
import type { Note } from './composer';
import { midiToHz } from './theory';

type Ctx = BaseAudioContext;

const FLOOR = 0.0001;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, shared by everything that needs breath, wind or water. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rng = new Rng(0x6e6f6973);
    for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function noise(ctx: Ctx, loop: boolean): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = loop;
  return s;
}

/** A quick attack and an exponential fall to silence at t + dur. */
function pluckEnv(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
  g.setValueAtTime(FLOOR, t);
  g.linearRampToValueAtTime(Math.max(FLOOR, peak), t + attack);
  g.exponentialRampToValueAtTime(FLOOR, t + dur);
}

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** A plucked string: a bright saw and triangle through a closing filter, with a fingernail click. */
export function pluck(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number, slide = 0): void {
  const g = ctx.createGain();
  g.connect(out);
  const lp = filter(ctx, 'lowpass', Math.min(9000, hz * 10), 2);
  lp.frequency.setValueAtTime(Math.min(9000, hz * 10), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(250, hz * 1.5), t + dur * 0.5);
  lp.connect(g);
  const end = t + dur + 0.05;
  for (const [type, detune] of [['sawtooth', 0], ['triangle', 6]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(hz * Math.pow(2, slide / 12), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(hz, t + 0.14);
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(end);
  }
  pluckEnv(g.gain, t, 0.3 * vel, 0.004, dur);
  tick(ctx, out, t, 0.25 * vel, hz * 2);
}

/** A bamboo flute: a breathy sine that swells in, then gains vibrato. */
export function flute(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number): void {
  const g = ctx.createGain();
  g.connect(out);
  const peak = 0.28 * vel;
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.15);
  g.gain.linearRampToValueAtTime(peak * 0.85, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  const end = t + dur + 0.05;

  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(hz * 0.007, t + 0.5);
  vib.connect(vibDepth);
  vib.start(t);
  vib.stop(end);

  for (const [mult, level] of [[1, 1], [2, 0.15]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz * mult * 0.97, t);
    o.frequency.linearRampToValueAtTime(hz * mult, t + 0.08);
    vibDepth.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(end);
  }

  const breath = noise(ctx, true);
  const bp = filter(ctx, 'bandpass', hz * 2, 6);
  const bg = ctx.createGain();
  bg.gain.value = 0.35;
  breath.connect(bp).connect(bg).connect(g);
  breath.start(t);
  breath.stop(end);
}

/** A soft low note: a sine with a quiet octave above it so small speakers can still hear it. */
export function bass(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number): void {
  const g = ctx.createGain();
  g.connect(out);
  pluckEnv(g.gain, t, 0.32 * vel, 0.03, dur);
  for (const [type, mult, level] of [['sine', 1, 1], ['triangle', 2, 0.15]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz * mult;
    const og = ctx.createGain();
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** A small bell: two inharmonic sines that fade quickly. */
export function chime(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur = 1.4): void {
  for (const [mult, level, d] of [[1, 1, dur], [2.76, 0.35, dur * 0.5]] as const) {
    const g = ctx.createGain();
    g.connect(out);
    pluckEnv(g.gain, t, 0.2 * vel * level, 0.002, d);
    const o = ctx.createOscillator();
    o.frequency.value = hz * mult;
    o.connect(g);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

/** A temple gong: inharmonic partials that die away at different speeds. */
export function gong(ctx: Ctx, out: AudioNode, t: number, vel = 1, base = 98): void {
  const partials = [[1, 1, 4.5], [1.47, 0.7, 3.5], [2.09, 0.5, 2.6], [2.56, 0.35, 1.8], [3.2, 0.25, 1.2]] as const;
  for (const [mult, level, d] of partials) {
    const g = ctx.createGain();
    g.connect(out);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.22 * vel * level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
    const o = ctx.createOscillator();
    o.frequency.value = base * mult;
    o.connect(g);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

// ---- sound effects ----

/** A short noise tick: a blade nicking ink, a spark, a fingernail. */
export function tick(ctx: Ctx, out: AudioNode, t: number, vel: number, hz = 3000): void {
  const s = noise(ctx, false);
  const bp = filter(ctx, 'bandpass', hz, 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(FLOOR, 0.5 * vel), t);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.03);
  s.connect(bp).connect(g).connect(out);
  s.start(t, 0, 0.04);
}

/** The blade through the air: noise swept upward. */
export function whoosh(ctx: Ctx, out: AudioNode, t: number, power: number): void {
  const s = noise(ctx, true);
  const bp = filter(ctx, 'bandpass', 500, 1.2);
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(0.35 * power, t + 0.06);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.3);
  s.connect(bp).connect(g).connect(out);
  s.start(t);
  s.stop(t + 0.35);
}

/** A heavy hit: a dropping sine and a muffled burst. `strength` is 0..1. */
export function thud(ctx: Ctx, out: AudioNode, t: number, strength: number): void {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(FLOOR, 0.6 * strength), t);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.35);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
  const s = noise(ctx, false);
  const lp = filter(ctx, 'lowpass', 500);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(Math.max(FLOOR, 0.4 * strength), t);
  ng.gain.exponentialRampToValueAtTime(FLOOR, t + 0.15);
  s.connect(lp).connect(ng).connect(out);
  s.start(t, 0, 0.2);
}

/** A few uneven ticks, like twigs catching. */
export function crackle(ctx: Ctx, out: AudioNode, t: number, rng: Rng, vel = 0.6): void {
  const n = 2 + rng.int(3);
  let at = t;
  for (let i = 0; i < n; i++) {
    tick(ctx, out, at, vel * rng.range(0.4, 1), rng.range(1800, 5200));
    at += rng.range(0.01, 0.07);
  }
}

/** Schedule one composed note. `beatSec` is the length of a beat in seconds. */
export function playNote(ctx: Ctx, out: AudioNode, note: Note, t: number, beatSec: number): void {
  const hz = midiToHz(note.midi);
  const dur = note.dur * beatSec;
  switch (note.voice) {
    case 'pluck':
      return pluck(ctx, out, t, hz, note.vel, dur, note.slide ?? 0);
    case 'flute':
      return flute(ctx, out, t, hz, note.vel, dur);
    case 'bass':
      return bass(ctx, out, t, hz, note.vel, dur);
    case 'chime':
      return chime(ctx, out, t, hz * 2, note.vel);
  }
}
