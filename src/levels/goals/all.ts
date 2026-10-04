import { describeGoal, evaluateGoal, registerGoal, type GoalSpec } from '../../core/goals';

/**
 * { type: 'all', of: [goal, goal, ...], text?: '...' }: one objective made of several goals that
 * must all hold at once, e.g. "exactly two tall peaks, one each side of the moon". Progress is the
 * average of the parts.
 */
registerGoal(
  'all',
  (scan, args) => {
    const parts = partsOf(args).map((g) => evaluateGoal(scan, g));
    if (parts.length === 0) return { pass: true, progress: 1 };
    return { pass: parts.every((p) => p.pass), progress: parts.reduce((s, p) => s + (p.pass ? 1 : p.progress), 0) / parts.length };
  },
  (args) => (typeof args.text === 'string' ? args.text : partsOf(args).map(describeGoal).join(' and ')),
);

function partsOf(args: GoalSpec): GoalSpec[] {
  return Array.isArray(args.of) ? (args.of as GoalSpec[]) : [];
}
