import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });

// ESLint's first run loads the TS parser; that can take >5s on slow mounts (e.g. WSL /mnt/c).
const SLOW = { timeout: 30_000 };

/** Lint a fixture's text as if it were the file at `asPath` (relative to the repo root). */
async function lint(fixture: string, asPath: string) {
  const code = readFileSync(join(root, 'tests/fixtures', fixture), 'utf8');
  const [result] = await eslint.lintText(code, { filePath: join(root, asPath) });
  return result.messages.map((m) => m.ruleId);
}

describe('import boundaries (section 12.1)', SLOW, () => {
  it('fails when a gen/ file imports from sim/', async () => {
    expect(await lint('gen-imports-sim.ts', 'src/gen/badFixture.ts')).toContain('no-restricted-imports');
  });

  it('fails when a sim/ file imports from gen/', async () => {
    expect(await lint('sim-imports-gen.ts', 'src/sim/abilities/badFixture.ts')).toContain('no-restricted-imports');
  });

  it('fails when core/ imports from another folder', async () => {
    expect(await lint('core-imports-gen.ts', 'src/core/badFixture.ts')).toContain('no-restricted-imports');
  });

  it('allows gen -> core and pages -> everything', async () => {
    expect(await lint('gen-imports-core.ts', 'src/gen/okFixture.ts')).toEqual([]);
    expect(await lint('pages-imports-all.ts', 'src/pages/okFixture.ts')).toEqual([]);
  });
});

describe('determinism lint (section 9)', SLOW, () => {
  it('flags Math.random, Date.now, performance.now and new Date() in sim/', async () => {
    const rules = await lint('sim-nondeterminism.ts', 'src/sim/badFixture.ts');
    expect(rules.filter((r) => r === 'no-restricted-properties')).toHaveLength(3);
    expect(rules).toContain('no-restricted-syntax');
  });
});
