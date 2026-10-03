// Fine: linted as if it lived in src/pages/. Pages may import everything.
import { generate } from '../gen/generate';
import { step } from '../sim/step';

export const ok = [generate, step, Math.random()];
