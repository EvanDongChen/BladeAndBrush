/**
 * Section 12.8 acceptance #1 and #4: dropping files into the extension folders (and nothing else)
 * makes them show up in the registries and on both test pages; adding a param to the schema makes
 * a slider appear on both pages.
 *
 * The dummy files are written into the real src/ folders, loaded through a fresh Vite server (so
 * the import.meta.glob calls in pages/bootstrap.ts see them), and deleted afterwards.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

const DUMMIES: Record<string, string> = {
  'src/sim/elements/zz_test_dummy.ts': `import { registerElement, rgba } from '../../core/elements';
registerElement({ id: 250, name: 'zzDummyElement', kind: 'static', density: 1, flammability: 0, solidForScan: false, color: () => rgba(255, 0, 255) });`,
  'src/sim/abilities/zz_test_dummy.ts': `import { registerAbility } from '../../core/abilities';
registerAbility({ id: 'zzDummyAbility', name: 'Dummy ability', begin() {}, move() {}, end() {} });`,
  'src/gen/metrics/zz_test_dummy.ts': `import { registerMetric } from '../../core/scan';
registerMetric('zzDummyMetric', () => 42, 'Dummy metric');`,
  'src/levels/goals/zz_test_dummy.ts': `import { registerGoal } from '../../core/goals';
registerGoal('zzDummyGoal', () => ({ pass: true, progress: 1 }));`,
  'src/core/layers/zz_test_dummy.ts': `import { registerLayer } from '../render';
registerLayer({ name: 'zzDummyLayer', order: 50, kind: 'canvas', draw() {} });`,
};

let server: ViteDevServer;
let dom: JSDOM;
let pendingFrames: FrameRequestCallback[] = [];
const load = (path: string): Promise<any> => server.ssrLoadModule(path);

/** A 2D context that accepts every call; createImageData returns real pixel storage. */
function fakeContext() {
  const gradient = () => ({ addColorStop: () => {} });
  const target: Record<string | symbol, unknown> = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    createConicGradient: gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

function installDom(): void {
  dom = new JSDOM('<!doctype html><body></body>');
  const win = dom.window;
  win.HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as never;
  Object.assign(globalThis, {
    document: win.document,
    requestAnimationFrame: (cb: FrameRequestCallback) => pendingFrames.push(cb),
    cancelAnimationFrame: () => {},
  });
}

function runOneFrame(): void {
  const cbs = pendingFrames;
  pendingFrames = [];
  for (const cb of cbs) cb(16);
}

beforeAll(async () => {
  for (const [path, src] of Object.entries(DUMMIES)) writeFileSync(join(root, path), src + '\n');
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  installDom();
  await load('/src/pages/bootstrap.ts');
  // section 12.8 #4: one schema entry, no other edits
  const { registerParam } = await load('/src/core/params.ts');
  registerParam({ key: 'zzDummyParam', label: 'Dummy param', min: 0, max: 1, step: 0.1, default: 0.5 });
}, 60_000);

afterAll(async () => {
  for (const path of Object.keys(DUMMIES)) rmSync(join(root, path), { force: true });
  await server?.close();
  dom?.window.close();
  for (const k of ['document', 'requestAnimationFrame', 'cancelAnimationFrame']) delete (globalThis as Record<string, unknown>)[k];
});

describe('auto-discovery (section 12.8)', () => {
  it('dropped-in files register themselves', async () => {
    const [{ elements }, { abilities }, { metrics }, { goalTypes }, { layers }] = await Promise.all([
      load('/src/core/elements.ts'),
      load('/src/core/abilities.ts'),
      load('/src/core/scan.ts'),
      load('/src/core/goals.ts'),
      load('/src/core/render.ts'),
    ]);
    expect(elements.get(250)?.name).toBe('zzDummyElement');
    expect(abilities.has('zzDummyAbility')).toBe(true);
    expect(metrics.has('zzDummyMetric')).toBe(true);
    expect(goalTypes.has('zzDummyGoal')).toBe(true);
    expect(layers.has('zzDummyLayer')).toBe(true);

    const { scan } = await load('/src/gen/scan.ts');
    const { World } = await load('/src/core/world.ts');
    expect(scan(new World({ w: 10, h: 10 }, 1)).counts.zzDummyMetric).toBe(42);
  });

  it('they appear on the sandbox page', async () => {
    const { mountSandbox } = await load('/src/pages/sandbox.ts');
    const app = document.createElement('div');
    const stop = mountSandbox(app);
    runOneFrame();
    expect(app.querySelector('[data-element="250"]')?.textContent).toBe('zzDummyElement');
    expect(app.querySelector('[data-count="250"]')).not.toBeNull();
    expect(app.querySelector('[data-ability="zzDummyAbility"]')).not.toBeNull();
    expect(app.querySelector('[data-layer="zzDummyLayer"]')).not.toBeNull();
    expect(app.querySelector('[data-param="zzDummyParam"]')).not.toBeNull();
    expect(app.querySelector('[data-registry="metric"]')?.textContent).toContain('zzDummyMetric');
    expect(app.querySelector('[data-registry="goal"]')?.textContent).toContain('zzDummyGoal');
    stop();
  });

  it('they appear on the generator page', async () => {
    const { mountGenerator } = await load('/src/pages/generator.ts');
    const app = document.createElement('div');
    const stop = mountGenerator(app);
    runOneFrame();
    expect(app.querySelector('[data-metric="zzDummyMetric"]')?.textContent).toBe('42');
    expect(app.querySelector('[data-layer="zzDummyLayer"]')).not.toBeNull();
    expect(app.querySelector('[data-param="zzDummyParam"]')).not.toBeNull();
    expect(app.querySelector('[data-registry="element"]')?.textContent).toContain('zzDummyElement');
    expect(app.querySelector('[data-registry="ability"]')?.textContent).toContain('zzDummyAbility');
    expect(app.querySelector('[data-registry="goal"]')?.textContent).toContain('zzDummyGoal');
    stop();
  });
});
