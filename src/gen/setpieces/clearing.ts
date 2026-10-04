import { num, registerSetpiece } from '../../core/setpieces';

/** { type: 'clearing', x0: 0.4, x1: 0.6 }: no free mountain covers this stretch of the scroll. */
registerSetpiece({
  type: 'clearing',
  label: 'Clearing',
  clears: (spec) => [[num(spec, 'x0', 0.45), num(spec, 'x1', 0.55)]],
});
