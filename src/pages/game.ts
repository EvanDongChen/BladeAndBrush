import './bootstrap';
import { describeGoal } from '../core/goals';
import { levels } from '../core/levels';
import { h, pageHeader, panel } from './ui';

/** Game shell. STUB: the real pipeline (section 8) lands after feat/generator and feat/abilities. */
export function mountGame(root: HTMLElement): () => void {
  const list = h('ul', { class: 'levels' });
  for (const l of levels.all()) {
    list.append(
      h(
        'li',
        {},
        h('strong', {}, l.id),
        h('p', { class: 'poem' }, ...l.poem.flatMap((line, i) => (i ? [h('br'), line] : [line]))),
        h('p', {}, `Goals: ${l.goals.map(describeGoal).join(', ')} · budget ${l.actionBudget}`),
      ),
    );
  }
  root.replaceChildren(
    pageHeader('Game'),
    h(
      'main',
      { class: 'shell' },
      panel(
        'Integration pending',
        h('p', {}, 'The game loop comes after both branches land. For now use the test pages:'),
        h(
          'ul',
          {},
          h('li', {}, h('a', { href: './generator.html' }, 'Generator'), ': seed, params, frontier reveal, scan (Person A)'),
          h('li', {}, h('a', { href: './sandbox.html' }, 'Sandbox'), ': elements, abilities, record/replay (Person B)'),
        ),
      ),
      panel('Levels', list),
    ),
  );
  return () => {};
}

const app = document.getElementById('app');
if (app) mountGame(app);
