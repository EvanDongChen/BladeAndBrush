// This config does two jobs only: enforce the import boundaries from PLAN.md section 12.1
// and the determinism rule from section 9. It is run by `npm test`.
import tseslint from 'typescript-eslint';

/** Import specifiers that point into one of the named top-level src folders. */
const into = (...folders) =>
  folders.map((f) => ({
    regex: `(^|/)${f}(/|$)`,
    message: `This folder may not import from src/${f}/ (see PLAN.md section 12.1).`,
  }));

const boundary = (files, ...forbidden) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns: into(...forbidden) }] },
});

const nondeterminism = 'Not allowed in core/, gen/ or sim/: use world.rng / core/rng.ts and the tick counter (PLAN.md section 9).';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tests/fixtures/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
  },

  // Dependency direction: core <- gen, core <- sim, core <- audio/levels, pages -> everything.
  boundary(['src/core/**/*.ts'], 'gen', 'sim', 'pages', 'levels', 'audio'),
  boundary(['src/gen/**/*.ts'], 'sim', 'pages', 'levels', 'audio'),
  boundary(['src/sim/**/*.ts'], 'gen', 'pages', 'levels', 'audio'),
  boundary(['src/levels/**/*.ts', 'src/audio/**/*.ts'], 'gen', 'sim', 'pages'),

  // Determinism: no Math.random or wall-clock time inside the simulation and generator.
  {
    files: ['src/core/**/*.ts', 'src/gen/**/*.ts', 'src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: nondeterminism },
        { object: 'Date', property: 'now', message: nondeterminism },
        { object: 'performance', property: 'now', message: nondeterminism },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: nondeterminism },
      ],
    },
  },
);
