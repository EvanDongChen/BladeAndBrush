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
only adds `putImageData` / `drawImage` of the k x canvas; `bench/frame.md` explains how to read
that in the page (`?perf` overlay).
