# BladeAndBrush: Zhan-Shui (斬山水)

A procedurally painted shan-shui (mountain and water) landscape that you change with a blade. The painting lives in a Noita-style cell grid. You slash, burn, flood and push it until it matches the poem's goals, and a scanner reads the cells to check.

Stack: Vite + TypeScript, Canvas 2D, Vitest. No UI framework. The design is in [PLAN.md](PLAN.md).

## Run

```sh
npm install
npm run dev     # then open:
                #   /                 game shell (integration comes later)
                #   /generator.html   generator test page (Person A)
                #   /sandbox.html     particle sandbox (Person B)
npm test        # typecheck + lint (import boundaries, determinism) + unit tests
npm run build
```

## Ownership

| Area | Owner |
|---|---|
| `src/gen/`, `src/pages/generator.ts` | Person A: generator + scanner |
| `src/sim/`, `src/pages/sandbox.ts` | Person B: abilities + effects |
| `src/core/` | Shared contract. Small PRs only, with a heads-up to the other person |

## Rules

- **No `Math.random` and no wall-clock time in the sim.** Inside `src/core/`, `src/gen/` and `src/sim/`, all randomness goes through the seeded RNG and time is counted in ticks. This is what makes replays exact. `npm test` lints for it.
- `gen/` and `sim/` never import each other; they share only `core/` types. This is also linted.
- Element ids are append-only.
- To extend the game, add one file to a folder; nothing else needs editing. See [CLAUDE.md](CLAUDE.md) for the extension points.

## Credits

The generator is inspired by [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) by Lingdong Huang (MIT). It is used as reference reading only, and no code from it is copied into this project.
