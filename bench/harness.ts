import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { join } from 'node:path';

export interface Result {
  name: string;
  /** What is measured, e.g. "ms per call" or "MB". */
  unit: string;
  median: number;
  min: number;
  p95: number;
  runs: number;
}

const results: Result[] = [];
const dir = join(process.cwd(), 'bench');

/** Time fn: `warm` unmeasured calls, then `runs` measured ones (ms each). */
export function bench(name: string, fn: () => void, runs = 15, warm = 3): Result {
  for (let i = 0; i < warm; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return record(name, 'ms', t);
}

/** Record a list of samples (already measured) under a name. */
export function record(name: string, unit: string, samples: number[]): Result {
  const s = [...samples].sort((a, b) => a - b);
  const r: Result = {
    name,
    unit,
    median: s[Math.floor(s.length / 2)],
    min: s[0],
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    runs: s.length,
  };
  results.push(r);
  return r;
}

export function value(name: string, unit: string, v: number): void {
  results.push({ name, unit, median: v, min: v, p95: v, runs: 1 });
}

const f = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

/** Print a table, compare with bench/baseline.json if it exists, and write bench/results/latest.json. */
export function finish(): void {
  const basePath = join(dir, 'baseline.json');
  const base: Record<string, Result> = {};
  if (existsSync(basePath)) for (const r of (JSON.parse(readFileSync(basePath, 'utf8')).results as Result[])) base[r.name] = r;
  const lines = [`\n${'benchmark'.padEnd(52)} ${'median'.padStart(9)} ${'min'.padStart(9)} ${'p95'.padStart(9)}  unit   vs baseline`];
  for (const r of results) {
    const b = base[r.name];
    const delta = b && b.median > 0 ? ` ${(((r.median - b.median) / b.median) * 100).toFixed(0).padStart(5)}%` : '';
    lines.push(`${r.name.padEnd(52)} ${f(r.median).padStart(9)} ${f(r.min).padStart(9)} ${f(r.p95).padStart(9)}  ${r.unit.padEnd(5)}${delta}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  mkdirSync(join(dir, 'results'), { recursive: true });
  const meta = { date: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model ?? '?', cores: cpus().length, platform: platform() };
  writeFileSync(join(dir, 'results', 'latest.json'), JSON.stringify({ meta, results }, null, 2));
}
