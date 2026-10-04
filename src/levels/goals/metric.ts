import { registerGoal, type GoalSpec } from '../../core/goals';

type Op = '>=' | '<=' | '>' | '<' | '==';

const compare = (v: number, op: Op, n: number) =>
  op === '>=' ? v >= n : op === '<=' ? v <= n : op === '>' ? v > n : op === '<' ? v < n : v === n;

/**
 * { type: 'metric', metric: 'trees', op: '>=', n: 5, text?: 'Keep five trees' }: compare any scan
 * metric to a number. `text` is what the HUD shows (default: the comparison itself).
 */
registerGoal(
  'metric',
  (scan, args) => {
    const { metric, op, n } = args as GoalSpec & { metric: string; op: Op; n: number };
    const v = scan.counts[metric];
    if (v === undefined) throw new Error(`Goal references unknown metric "${metric}"`);
    const pass = compare(v, op, n);
    const progress = pass ? 1 : op === '>=' || op === '>' ? Math.min(1, n > 0 ? v / n : 0) : 0;
    return { pass, progress };
  },
  (args) => (typeof args.text === 'string' ? args.text : `${String(args.metric)} ${String(args.op)} ${String(args.n)}`),
);
