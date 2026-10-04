/**
 * Browser frame benchmark: `npm run bench:browser`. Starts the Vite dev server, opens the pages in
 * headless Chromium with `?perf`, lets each scenario run, and records window.__perf (src/pages/perf.ts).
 * Writes bench/results/browser-latest.json and compares with bench/browser-baseline.json.
 *
 * Headless Chromium draws the canvas in software, so absolute numbers are worse than a real GPU
 * browser; use it to compare runs. For the real thing open any page with ?perf.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

interface Stat {
  mean: number;
  max: number;
}
interface Snapshot {
  fps: number;
  frameMs: Stat;
  simMs: Stat;
  ticksPerFrame: number;
  callbackMs: Stat;
  layers: Record<string, Stat>;
  canvas: Record<string, Stat & { calls: number }>;
  otherMs: Stat;
}
interface Row {
  name: string;
  value: number;
  unit: string;
}

const dir = join(process.cwd(), 'bench');
const outName = process.env.BENCH_OUT ?? 'browser-latest.json';
/** Extra query for every page, e.g. BENCH_QUERY=cpu to measure the CPU ink layer. */
const extra = process.env.BENCH_QUERY ? `&${process.env.BENCH_QUERY}` : '';
const rows: Row[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function measure(page: Page, name: string, ms = 4000): Promise<void> {
  // BENCH_PROFILE=<part of a scenario name>: save a Chrome CPU profile of that scenario
  const prof = process.env.BENCH_PROFILE && name.includes(process.env.BENCH_PROFILE);
  const cdp = prof ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  await wait(ms);
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    mkdirSync(join(dir, 'results'), { recursive: true });
    const file = join(dir, 'results', `${name.replace(/\W+/g, '-')}.cpuprofile`);
    writeFileSync(file, JSON.stringify(profile));
    console.log('profile:', file);
  }
  const p = (await page.evaluate(() => (globalThis as unknown as { __perf: unknown }).__perf)) as Snapshot | undefined;
  if (!p) throw new Error(`${name}: no window.__perf (did the page start its loop?)`);
  rows.push({ name: `${name}: fps`, value: p.fps, unit: 'fps' });
  rows.push({ name: `${name}: frame interval mean`, value: p.frameMs.mean, unit: 'ms' });
  rows.push({ name: `${name}: frame interval max`, value: p.frameMs.max, unit: 'ms' });
  rows.push({ name: `${name}: sim per frame`, value: p.simMs.mean, unit: 'ms' });
  rows.push({ name: `${name}: frame callback`, value: p.callbackMs.mean, unit: 'ms' });
  for (const [k, v] of Object.entries(p.layers)) if (v.max > 0) rows.push({ name: `${name}: layer ${k}`, value: v.mean, unit: 'ms' });
  rows.push({ name: `${name}: other (overlays, UI, scan)`, value: p.otherMs.mean, unit: 'ms' });
  for (const [k, v] of Object.entries(p.canvas ?? {})) {
    if (v.max <= 0) continue;
    rows.push({ name: `${name}: ${k} (in layers)`, value: v.mean, unit: 'ms' });
    rows.push({ name: `${name}: ${k} calls`, value: v.calls, unit: 'n' });
  }
}

/** Drag across the canvas from (x0, y0) to (x1, y1), as fractions of its box. */
async function drag(page: Page, sel: string, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no ${sel}`);
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
  await page.mouse.down();
  for (let s = 1; s <= 12; s++) {
    const t = s / 12;
    await page.mouse.move(b.x + b.width * (x0 + (x1 - x0) * t), b.y + b.height * (y0 + (y1 - y0) * t));
    await wait(16);
  }
  await page.mouse.up();
}

// BENCH_URL: use a server that is already running (e.g. Vite in WSL, this script run by Windows
// node so it drives Windows Chrome with its real GPU). Otherwise start Vite here.
let server: { close(): Promise<void> } = { close: async () => {} };
let base = process.env.BENCH_URL ?? '';
if (!base) {
  const { createServer } = await import('vite');
  const vite = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false } });
  await vite.listen();
  server = vite;
  base = vite.resolvedUrls?.local[0] ?? 'http://localhost:5199/';
}
if (!base.endsWith('/')) base += '/';
const browser = await chromium
  .launch({
    executablePath: process.env.CHROME_PATH,
    headless: !process.env.HEADED,
    args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  })
  .catch(async (e: Error) => {
    await server.close();
    console.error(
      'Could not start headless Chromium. Once per machine: `npx playwright install chromium` and, on Linux/WSL,\n' +
        '`sudo npx playwright install-deps chromium` (system libraries). Or point CHROME_PATH at a Chrome binary.\n',
      e.message.split('\n')[0],
    );
    process.exit(1);
  });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));

  // a level: unrolling, then idle, then after a few cuts
  await page.goto(`${base}level.html?level=level-1&perf${extra}`);
  await page.waitForSelector('canvas.grid');
  await measure(page, 'level unrolling', 3000);
  await measure(page, 'level idle', 5000);
  for (let i = 0; i < 4; i++) await drag(page, 'canvas.grid', 0.15 + i * 0.2, 0.25, 0.3 + i * 0.2, 0.8);
  await measure(page, 'level after cuts', 4000);

  // the sandbox: its blueprint scene, then the pond (water shading)
  await page.goto(`${base}sandbox.html?perf${extra}`);
  await page.waitForSelector('canvas');
  await measure(page, 'sandbox blueprint', 4000);
  await page.locator('select').filter({ hasText: 'Pond and earth' }).selectOption({ label: 'Pond and earth' });
  await measure(page, 'sandbox pond', 4000);
} finally {
  await browser.close();
  await server.close();
}

const basePath = join(dir, 'browser-baseline.json');
const prev: Record<string, number> = {};
if (existsSync(basePath)) for (const r of JSON.parse(readFileSync(basePath, 'utf8')).rows as Row[]) prev[r.name] = r.value;
const out = [`\n${'browser benchmark'.padEnd(48)} ${'value'.padStart(8)}  unit  vs baseline`];
for (const r of rows) {
  const b = prev[r.name];
  const d = b ? ` ${(((r.value - b) / b) * 100).toFixed(0).padStart(5)}%` : '';
  out.push(`${r.name.padEnd(48)} ${r.value.toFixed(r.value >= 100 ? 0 : 2).padStart(8)}  ${r.unit.padEnd(4)}${d}`);
}
console.log(out.join('\n'));
mkdirSync(join(dir, 'results'), { recursive: true });
const latest = join(dir, 'results', outName);
writeFileSync(latest, JSON.stringify({ date: new Date().toISOString(), rows }, null, 2));
if (process.argv.includes('--baseline')) copyFileSync(latest, basePath);
