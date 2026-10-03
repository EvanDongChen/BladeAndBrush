// Deliberately bad: linted as if it lived in src/gen/. gen/ may not import sim/.
import { step } from '../sim/step';

export const s = step;
