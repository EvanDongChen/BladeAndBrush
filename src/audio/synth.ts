/**
 * The instruments, built from the plucked-string model in strings.ts plus plain oscillators and
 * noise, so the game needs no audio files:
 *
 *   古筝 guzheng, 琵琶 pipa, 古琴 guqin: Karplus-Strong samples, rendered once per pitch and
 *     cached. Slides (滑音), pressed bends (按音) and vibrato (揉弦) move the sample's detune.
 *   泛音 guqin harmonics: pure, bell-like overtones.
 *   笛子 dizi: a breathy flute with the buzz of its reed membrane (笛膜) and grace notes.
 *   二胡 erhu: a bowed string, sliding between notes, its vibrato growing as the bow settles.
 *   木魚 woodblock, 堂鼓 drum, 鑼 gong and a small bell; and the sound-effect sounds.
 *
 * Every function schedules at a time `t` on any BaseAudioContext, so the same code plays live and
 * renders offline. They do not touch the World.
 */
import { Rng } from '../core/rng';
import { fitRange, type Note } from './composer';
import { renderString, STRING_RATE, type StringKind } from './strings';
import { midiToHz } from './theory';

type Ctx = BaseAudioContext;

const FLOOR = 0.0001;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const stringCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

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

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 1, gain = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/** A slow sine that wobbles `param` by up to `depth`, fading in over `rise` from `from`, until `end`. */
function vibrato(ctx: Ctx, param: AudioParam, rate: number, depth: number, from: number, rise: number, end: number): void {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, from);
  g.gain.linearRampToValueAtTime(depth, from + rise);
  lfo.connect(g).connect(param);
  lfo.start(from);
  lfo.stop(end);
}

// ---- plucked strings ----

/** The cached sample for a plucked note (rendered on first use). */
export function stringBuffer(ctx: Ctx, kind: StringKind, midi: number): AudioBuffer {
  let cache = stringCache.get(ctx);
  if (!cache) stringCache.set(ctx, (cache = new Map()));
  const key = `${kind}:${midi}`;
  let buf = cache.get(key);
  if (!buf) {
    const data = renderString(kind, midiToHz(midi));
    buf = ctx.createBuffer(1, data.length, STRING_RATE);
    buf.copyToChannel(data, 0);
    cache.set(key, buf);
  }
  return buf;
}

const STRING_LEVEL: Record<StringKind, number> = { guzheng: 1, pipa: 0.85, guqin: 1 };

/** Render the samples a list of notes will need now, so nothing renders while the music plays. */
export function prepareStrings(ctx: Ctx, notes: readonly Note[]): void {
  for (const n of notes) if (n.voice === 'guzheng' || n.voice === 'pipa' || n.voice === 'guqin') stringBuffer(ctx, n.voice, fitRange(n.voice, n.midi));
}

/** A plucked string, with an optional slide into the note and a pressed bend after it. */
export function pluckString(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  kind: StringKind,
  midi: number,
  vel: number,
  dur: number,
  slide = 0,
  bend = 0,
): void {
  const buf = stringBuffer(ctx, kind, midi);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const ring = Math.min(buf.duration, dur + 0.25);
  if (slide) {
    src.detune.setValueAtTime(slide * 100, t);
    src.detune.linearRampToValueAtTime(0, t + 0.13);
  }
  if (bend) {
    src.detune.setValueAtTime(0, t + 0.18);
    src.detune.linearRampToValueAtTime(bend * 100, t + 0.42);
  }
  if (ring > 1.2 && kind !== 'pipa') vibrato(ctx, src.detune, 5, kind === 'guqin' ? 18 : 10, t + 0.45, 0.4, t + ring);
  const g = ctx.createGain();
  const level = STRING_LEVEL[kind] * vel;
  g.gain.setValueAtTime(level, t);
  g.gain.setValueAtTime(level, t + Math.max(0, ring - 0.12));
  g.gain.linearRampToValueAtTime(0, t + ring); // a finger damps the string
  src.connect(g).connect(out);
  src.start(t);
  src.stop(t + ring + 0.01);
}

/** 泛音: a guqin harmonic, a string touched lightly at a node so only a clear overtone rings. */
export function harmonic(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number): void {
  for (const [mult, level, d] of [[1, 1, dur], [2, 0.12, dur * 0.4], [3, 0.05, dur * 0.25]] as const) {
    const g = ctx.createGain();
    g.connect(out);
    pluckEnv(g.gain, t, 0.22 * vel * level, 0.006, d);
    const o = ctx.createOscillator();
    o.frequency.value = hz * mult;
    o.connect(g);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

// ---- winds and bowed strings ----

/** 笛子: a soft, breathy flute that swells in and gains vibrato. */
export function dizi(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number, grace = 0): void {
  const g = ctx.createGain();
  g.connect(out);
  const peak = 0.2 * vel;
  const end = t + dur + 0.08;
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.06);
  g.gain.linearRampToValueAtTime(peak * 0.85, t + Math.max(0.1, dur * 0.7));
  g.gain.exponentialRampToValueAtTime(FLOOR, end);

  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(hz * 0.006, t + Math.min(0.6, dur * 0.6));
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.6;
  vib.connect(vibDepth);
  vib.start(t);
  vib.stop(end);

  for (const [mult, level] of [[1, 1], [2, 0.15], [3, 0.04]] as const) {
    const o = ctx.createOscillator();
    if (grace) {
      o.frequency.setValueAtTime(hz * mult * Math.pow(2, grace / 12), t);
      o.frequency.setValueAtTime(hz * mult, t + 0.07);
    } else {
      o.frequency.setValueAtTime(hz * mult * 0.98, t);
      o.frequency.linearRampToValueAtTime(hz * mult, t + 0.05);
    }
    vibDepth.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(end);
  }

  const breath = noise(ctx, true);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.25, t);
  bg.gain.linearRampToValueAtTime(0.08, t + 0.12); // a little chiff on the attack, then a soft breath
  breath.connect(filter(ctx, 'bandpass', hz, 8)).connect(bg).connect(g);
  breath.start(t);
  breath.stop(end);
}

/** 二胡: a bowed string through a small, bright body, sliding in and singing with vibrato. */
export function erhu(ctx: Ctx, out: AudioNode, t: number, hz: number, vel: number, dur: number, slide = 0): void {
  const g = ctx.createGain();
  const peak = 0.2 * vel;
  const end = t + dur + 0.15;
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.09);
  g.gain.setValueAtTime(peak, t + Math.max(0.1, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(FLOOR, end);

  // the python-skin body: a nasal resonance near 1 kHz and a bright one near 2.6 kHz
  const hp = filter(ctx, 'highpass', 180, 0.7);
  const lp = filter(ctx, 'lowpass', Math.min(6000, hz * 7), 0.8);
  hp.connect(filter(ctx, 'peaking', 1000, 2, 7)).connect(filter(ctx, 'peaking', 2600, 3, 4)).connect(lp).connect(g).connect(out);

  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t + 0.2);
  vibDepth.gain.linearRampToValueAtTime(hz * 0.014, t + 0.2 + Math.min(0.5, dur * 0.5));
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.8;
  vib.connect(vibDepth);
  vib.start(t);
  vib.stop(end);

  for (const detune of [-4, 5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = detune;
    o.frequency.setValueAtTime(hz * Math.pow(2, slide / 12), t);
    o.frequency.exponentialRampToValueAtTime(hz, t + (slide ? 0.18 : 0.02));
    vibDepth.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(hp);
    o.start(t);
    o.stop(end);
  }

  // rosin on horsehair
  const bow = noise(ctx, true);
  const bg = ctx.createGain();
  bg.gain.value = 0.06;
  bow.connect(filter(ctx, 'bandpass', hz * 4, 2)).connect(bg).connect(hp);
  bow.start(t);
  bow.stop(end);
}

// ---- percussion ----

/** 木魚: a hollow wooden knock. */
export function muyu(ctx: Ctx, out: AudioNode, t: number, vel: number, hz = 700): void {
  const f = Math.max(450, Math.min(1100, hz));
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f * 1.08, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.015);
  const g = ctx.createGain();
  pluckEnv(g.gain, t, 0.45 * vel, 0.001, 0.12);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.15);
  tick(ctx, out, t, 0.4 * vel, 2200);
}

/** 堂鼓: a barrel drum, a low membrane that drops in pitch as it settles. */
export function drum(ctx: Ctx, out: AudioNode, t: number, vel: number): void {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(72, t + 0.09);
  const g = ctx.createGain();
  pluckEnv(g.gain, t, 0.55 * vel, 0.003, 0.8);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.85);
  const s = noise(ctx, false);
  const ng = ctx.createGain();
  pluckEnv(ng.gain, t, 0.25 * vel, 0.001, 0.08);
  s.connect(filter(ctx, 'lowpass', 900)).connect(ng).connect(out);
  s.start(t, 0, 0.1);
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

/** 鑼: a temple gong, inharmonic partials that die away at different speeds. */
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
  const midi = fitRange(note.voice, note.midi);
  const hz = midiToHz(midi);
  const dur = note.dur * beatSec;
  switch (note.voice) {
    case 'guzheng':
    case 'pipa':
    case 'guqin':
      return pluckString(ctx, out, t, note.voice, midi, note.vel, dur, note.slide ?? 0, note.bend ?? 0);
    case 'harmonic':
      return harmonic(ctx, out, t, hz, note.vel, dur);
    case 'dizi':
      return dizi(ctx, out, t, hz, note.vel, dur, note.grace ?? 0);
    case 'erhu':
      return erhu(ctx, out, t, hz, note.vel, dur, note.slide ?? 0);
    case 'chime':
      return chime(ctx, out, t, hz, note.vel);
    case 'muyu':
      return muyu(ctx, out, t, note.vel, hz);
    case 'drum':
      return drum(ctx, out, t, note.vel);
    case 'gong':
      return gong(ctx, out, t, note.vel, hz);
  }
}
