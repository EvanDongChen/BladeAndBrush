import { describe, expect, it } from 'vitest';
import { validateSubmission } from '../server/validate.js';

function body(overrides: Record<string, unknown> = {}) {
  return {
    levelId: 'demo',
    seed: 1,
    params: { mountainHeight: 0.5 },
    actionLog: [{ tick: 3, ability: 'slash', path: [] }],
    png: 'data:image/png;base64,AAA',
    result: { pass: true, progress: 1 },
    worldHash: 42,
    appVersion: 'test',
    ...overrides,
  };
}

describe('validateSubmission', () => {
  it('accepts a valid body and normalizes the name', () => {
    const v = validateSubmission(body({ playerName: '  Ada  ' }));
    expect(v.playerName).toBe('Ada');
    expect(v.levelId).toBe('demo');
  });

  it('treats blank names as anonymous', () => {
    expect(validateSubmission(body({ playerName: '   ' })).playerName).toBeNull();
    expect(validateSubmission(body()).playerName).toBeNull();
  });

  it('rejects bad shapes', () => {
    for (const bad of [
      body({ seed: 1.5 }),
      body({ png: 'http://x/y.png' }),
      body({ result: { pass: true, progress: 2 } }),
      body({ actionLog: [{ ability: 'slash' }] }),
      body({ params: { a: Number.NaN } }),
      body({ appVersion: '' }),
      'nope',
    ]) {
      expect(() => validateSubmission(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it('rejects oversized payloads', () => {
    expect(() => validateSubmission(body({ png: 'data:image/png;base64,' + 'A'.repeat(2_000_000) }))).toThrow();
    expect(() =>
      validateSubmission(body({ actionLog: new Array(5001).fill({ tick: 0, ability: 'x', path: [] }) })),
    ).toThrow();
  });
});
