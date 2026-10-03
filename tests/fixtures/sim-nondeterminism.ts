// Deliberately bad: linted as if it lived in src/sim/. No Math.random or wall-clock time.
export const r = () => Math.random() + Date.now() + performance.now() + new Date().getTime();
