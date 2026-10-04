import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createApp } from '../server/app.js';

/** A stand-in for the Postgres pool: remembers what was inserted and serves it back. */
function fakePool() {
  const rows: Record<string, unknown>[] = [];
  const inserts: unknown[][] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT/iu.test(sql)) {
        inserts.push(params);
        const row = {
          id: '11111111-1111-1111-1111-111111111111',
          player_name: params[0],
          level_id: params[1],
          seed: params[2],
          params: JSON.parse(params[3] as string),
          action_log: JSON.parse(params[4] as string),
          png_url: params[5],
          result: JSON.parse(params[6] as string),
          scan: params[7] ? JSON.parse(params[7] as string) : null,
          world_hash: params[8],
          app_version: params[9],
          created_at: new Date('2026-10-04T10:00:00Z').toISOString(),
          delete_secret: '22222222-2222-2222-2222-222222222222',
        };
        rows.push(row);
        return { rows: [row], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    },
  };
  return { pool: pool as unknown as pg.Pool, inserts };
}

/** What the level page sends when a player signs a win. */
const win = {
  playerName: '勇敢的虎',
  levelId: 'level-1',
  seed: 11,
  params: { mountainHeight: 0.65, spacing: 0.2, gravity: 2 },
  actionLog: [{ tick: 130, ability: 'slash', args: { radius: 4 }, path: [{ t: 130, x: 100, y: 80, speed: 0 }], endTick: 150 }],
  png: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  result: { pass: true, progress: 1, strokes: 3, budget: 6 },
  scan: { trees: 12, tallMountains: 1 },
  worldHash: 669935869,
  appVersion: '0.1.0',
};

describe('gallery API with what the level page sends', () => {
  it('saves a signed win with its strokes and lists it back', async () => {
    const { pool, inserts } = fakePool();
    const app = createApp({ pool });

    const res = await app.request('/api/gallery', { method: 'POST', body: JSON.stringify(win), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { entry: { playerName: string; result: Record<string, unknown> }; deleteSecret: string };
    expect(saved.entry.playerName).toBe('勇敢的虎');
    expect(saved.entry.result).toEqual({ pass: true, progress: 1, strokes: 3, budget: 6 });
    expect(saved.deleteSecret).toBeTruthy();
    expect(JSON.parse(inserts[0][6] as string)).toEqual({ pass: true, progress: 1, strokes: 3, budget: 6 }); // what lands in the result column

    const list = await app.request('/api/gallery');
    const entries = (await list.json()) as { playerName: string; levelId: string; result: { strokes?: number } }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ playerName: '勇敢的虎', levelId: 'level-1' });
    expect(entries[0].result.strokes).toBe(3);
  });

  it('turns away a win with nonsense strokes', async () => {
    const { pool } = fakePool();
    const res = await createApp({ pool }).request('/api/gallery', {
      method: 'POST',
      body: JSON.stringify({ ...win, result: { pass: true, progress: 1, strokes: -2 } }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
