import type { Context, Next } from 'hono';

/** Tiny in-memory per-IP rate limiter. Single-process; fine for v1. */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';
    const now = Date.now();
    const window = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (window.length >= max) return c.json({ error: 'Rate limited' }, 429);
    window.push(now);
    hits.set(ip, window);
    await next();
  };
}
