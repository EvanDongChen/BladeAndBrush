# Benchmarks

Local only (not part of `npm test` or CI). Run from the repo root:

```sh
npm run bench            # measure everything, print a table, write bench/results/latest.json
npm run bench:baseline   # copy latest.json to bench/baseline.json (commit it to track progress)
```

Every run is compared with `bench/baseline.json` (the `vs baseline` column; negative = faster).
Numbers depend on the machine and on what else is running: compare runs on the same machine,
and treat differences under ~10% as noise.

What is measured (in node, so everything except the final canvas upload):
generation (whole and per feature), revealing, World.hash, scan, one sim step in several
scenes, and the CPU side of a frame: art compose, shaders, glow, the cells layer. The browser
only adds `putImageData` / `drawImage` of the k x canvas and the canvas layers (clouds, glow); see
that in the page (`?perf` overlay, below).

## In the browser

Add `?perf` to any page (`/level.html?level=level-1&perf`, `/sandbox.html?perf`, `/generator.html?perf`)
for an overlay with the real fps, the sim time per frame and each render layer's draw time
(rolling 120 frames; mean and max). This is the number that matters for the lag.

`npm run bench:browser` drives the same overlay in headless Chromium (level unrolling, idle,
after cuts; sandbox blueprint and pond) and writes `bench/results/browser-latest.json`
(`npm run bench:browser -- --baseline` saves it as `bench/browser-baseline.json`). One-time setup:
`npx playwright install chromium` and on Linux/WSL `sudo npx playwright install-deps chromium`.
Headless draws in software, so compare its runs with each other, not with a real browser.
