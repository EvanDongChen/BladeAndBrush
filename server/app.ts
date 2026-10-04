import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type pg from 'pg';
import { storePng } from './png.js';
import { rateLimit } from './rateLimit.js';
import { validateSubmission } from './validate.js';

export interface AppDeps {
  pool: pg.Pool;
}

interface EntryRow {
  id: string;
  player_name: string | null;
  level_id: string;
  seed: number;
  params: Record<string, number>;
  action_log: unknown[];
  png_url: string;
  result: { pass: boolean; progress: number; strokes?: number; budget?: number };
  scan: Record<string, unknown> | null;
  world_hash: number;
  app_version: string;
  created_at: string;
}

function toEntry(r: EntryRow) {
  return {
    id: r.id,
    playerName: r.player_name,
    levelId: r.level_id,
    seed: r.seed,
    params: r.params,
    actionLog: r.action_log,
    png: r.png_url,
    result: r.result,
    scan: r.scan,
    worldHash: r.world_hash,
    appVersion: r.app_version,
    createdAt: new Date(r.created_at).getTime(),
  };
}

const SELECT = `id, player_name, level_id, seed, params, action_log, png_url,
  result, scan, world_hash, app_version, created_at`;

export function createApp({ pool }: AppDeps): Hono {
  const app = new Hono();
  app.use('/api/*', cors());
  app.use('/api/gallery', rateLimit(60, 60_000));

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/gallery', async (c) => {
    const level = c.req.query('level');
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
    const { rows } = level
      ? await pool.query<EntryRow>(
          `SELECT ${SELECT} FROM gallery_entries WHERE level_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [level, limit],
        )
      : await pool.query<EntryRow>(
          `SELECT ${SELECT} FROM gallery_entries ORDER BY created_at DESC LIMIT $1`,
          [limit],
        );
    return c.json(rows.map(toEntry));
  });

  app.get('/api/gallery/:id', async (c) => {
    const { rows } = await pool.query<EntryRow>(`SELECT ${SELECT} FROM gallery_entries WHERE id = $1`, [
      c.req.param('id'),
    ]);
    if (!rows[0]) return c.json({ error: 'Not found' }, 404);
    return c.json(toEntry(rows[0]));
  });

  const postLimit = rateLimit(10, 10 * 60_000);
  app.post('/api/gallery', postLimit, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    let sub;
    try {
      sub = validateSubmission(body);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    let pngUrl: string;
    try {
      pngUrl = await storePng(sub.png);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
    const inserted = await pool
      .query<{ id: string; delete_secret: string; created_at: string }>(
        `INSERT INTO gallery_entries
          (player_name, level_id, seed, params, action_log, png_url, result, scan, world_hash, app_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, delete_secret, created_at`,
        [
          sub.playerName,
          sub.levelId,
          sub.seed,
          JSON.stringify(sub.params),
          JSON.stringify(sub.actionLog),
          pngUrl,
          JSON.stringify(sub.result),
          sub.scan ? JSON.stringify(sub.scan) : null,
          sub.worldHash,
          sub.appVersion,
        ],
      )
      .catch((): null => null);
    const row = inserted?.rows[0];
    if (!row) return c.json({ error: 'Could not save entry' }, 500);
    return c.json(
      {
        entry: {
          id: row.id,
          playerName: sub.playerName,
          levelId: sub.levelId,
          seed: sub.seed,
          params: sub.params,
          actionLog: sub.actionLog,
          png: pngUrl,
          result: sub.result,
          scan: sub.scan,
          worldHash: sub.worldHash,
          appVersion: sub.appVersion,
          createdAt: new Date(row.created_at).getTime(),
        },
        deleteSecret: row.delete_secret,
      },
      201,
    );
  });

  app.delete('/api/gallery/:id', async (c) => {
    const secret = c.req.query('secret');
    if (!secret) return c.json({ error: 'Delete secret required' }, 401);
    const { rowCount } = await pool.query('DELETE FROM gallery_entries WHERE id = $1 AND delete_secret = $2', [
      c.req.param('id'),
      secret,
    ]);
    if (!rowCount) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });

  return app;
}
