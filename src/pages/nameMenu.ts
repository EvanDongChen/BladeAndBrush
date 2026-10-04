/**
 * The little menu on the win scroll where a player signs their painting for the gallery: a Chinese
 * adjective and one of the twelve zodiac animals, shown together as a name (勇敢的虎).
 */
import { ADJECTIVES, ZODIAC, aliasOf, saveChoice, savedChoice, type NameChoice, type Word } from '../gallery/names';
import { button, h } from './ui';

export interface NameMenu {
  node: HTMLElement;
  show(): void;
  hide(): void;
  /** Lock the menu while a painting is on its way. */
  busy(on: boolean): void;
}

function picker(label: string, words: readonly Word[], value: number): { row: HTMLElement; select: HTMLSelectElement } {
  const select = h('select', { 'aria-label': label });
  words.forEach((w, i) => select.append(h('option', { value: i }, `${w.zh}  ${w.en}`)));
  select.value = String(Math.max(0, Math.min(words.length - 1, value)));
  return { row: h('label', { class: 'name-field' }, h('span', {}, label), select), select };
}

/** `onSend` gets the chosen name when the player presses the button. The choice is remembered for next time. */
export function nameMenu(onSend: (alias: string) => void): NameMenu {
  const start = savedChoice();
  const adjective = picker('Adjective', ADJECTIVES, start.adjective);
  const zodiac = picker('Zodiac', ZODIAC, start.zodiac);
  const preview = h('output', { class: 'name-preview', 'aria-live': 'polite' });
  const choice = (): NameChoice => ({ adjective: Number(adjective.select.value), zodiac: Number(zodiac.select.value) });
  const update = () => (preview.textContent = aliasOf(choice()));
  adjective.select.addEventListener('change', update);
  zodiac.select.addEventListener('change', update);
  update();

  const send = button(
    'Send to the gallery',
    () => {
      saveChoice(choice());
      onSend(aliasOf(choice()));
    },
    { class: 'home-cta' },
  );
  const node = h(
    'div',
    { class: 'name-menu', hidden: true },
    h('p', { class: 'name-lead' }, 'Sign your painting'),
    h('div', { class: 'name-fields' }, adjective.row, zodiac.row),
    preview,
    send,
  );
  return {
    node,
    show: () => (node.hidden = false),
    hide: () => (node.hidden = true),
    busy: (on) => {
      send.disabled = on;
      adjective.select.disabled = on;
      zodiac.select.disabled = on;
    },
  };
}
