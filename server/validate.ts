/** Pure submission validation (no DB). Unit-tested. */

export interface SubmissionBody {
  playerName?: unknown;
  levelId?: unknown;
  seed?: unknown;
  params?: unknown;
  actionLog?: unknown;
  png?: unknown;
  result?: unknown;
  scan?: unknown;
  worldHash?: unknown;
  appVersion?: unknown;
}

export interface ValidSubmission {
  playerName: string | null;
  levelId: string;
  seed: number;
  params: Record<string, number>;
  actionLog: unknown[];
  png: string;
  result: { pass: boolean; progress: number; strokes?: number; budget?: number };
  scan: Record<string, unknown> | null;
  worldHash: number;
  appVersion: string;
}

const MAX_PNG_CHARS = 1_500_000;
const MAX_LOG_RECORDS = 5000;
const MAX_PARAM_KEYS = 50;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(msg: string): never {
  throw new Error(`Invalid submission: ${msg}`);
}

/** Throws on invalid input; returns the normalized submission. */
export function validateSubmission(body: unknown): ValidSubmission {
  if (!isRecord(body)) fail('body must be an object');

  const { playerName, levelId, seed, params, actionLog, png, result, scan, worldHash, appVersion } = body;

  if (typeof levelId !== 'string' || !levelId || levelId.length > 64) fail('levelId');
  if (typeof seed !== 'number' || !Number.isInteger(seed)) fail('seed');
  if (!isRecord(params)) fail('params');
  const paramEntries = Object.entries(params);
  if (paramEntries.length > MAX_PARAM_KEYS) fail('too many params');
  const cleanParams: Record<string, number> = {};
  for (const [k, v] of paramEntries) {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`params.${k}`);
    cleanParams[k] = v;
  }
  if (!Array.isArray(actionLog) || actionLog.length > MAX_LOG_RECORDS) fail('actionLog');
  for (const r of actionLog) {
    if (!isRecord(r) || typeof r.tick !== 'number' || typeof r.ability !== 'string') fail('actionLog record');
  }
  if (typeof png !== 'string' || png.length > MAX_PNG_CHARS) fail('png too large');
  if (!png.startsWith('data:image/png;base64,') && !png.startsWith('data:image/jpeg;base64,')) {
    fail('png must be a PNG/JPEG data URL');
  }
  if (!isRecord(result) || typeof result.pass !== 'boolean') fail('result');
  const progress = result.progress;
  if (typeof progress !== 'number' || progress < 0 || progress > 1) fail('result.progress');
  const count = (v: unknown, name: string): number | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1000) fail(name);
    return v;
  };
  const strokes = count(result.strokes, 'result.strokes');
  const budget = count(result.budget, 'result.budget');
  if (scan !== undefined && scan !== null && !isRecord(scan)) fail('scan');
  if (typeof worldHash !== 'number' || !Number.isInteger(worldHash) || worldHash < 0 || worldHash > 0xffffffff) fail('worldHash');
  if (typeof appVersion !== 'string' || !appVersion || appVersion.length > 32) fail('appVersion');

  let name: string | null = null;
  if (playerName !== undefined && playerName !== null) {
    if (typeof playerName !== 'string') fail('playerName');
    const trimmed = playerName.trim().slice(0, 64);
    name = trimmed ? trimmed : null;
  }

  return {
    playerName: name,
    levelId,
    seed,
    params: cleanParams,
    actionLog,
    png,
    result: { pass: result.pass, progress, ...(strokes !== undefined ? { strokes } : {}), ...(budget !== undefined ? { budget } : {}) },
    scan: scan == null ? null : (scan as Record<string, unknown>),
    worldHash,
    appVersion,
  };
}
