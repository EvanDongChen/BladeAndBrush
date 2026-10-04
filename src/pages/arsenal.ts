/**
 * Player-facing ability picker for the level page: a rack of weapon cards instead of plain buttons.
 * Presentation only. Ability behavior lives in `sim/abilities/`; the copy and keys here are keyed by
 * ability id, and an ability without an entry still gets a card from its registered name and icon.
 */
import { activeAbilities, type AbilityId } from '../core/abilities';
import { lineColor } from '../sim/lineAbility';
import { h } from './ui';

interface ArsenalInfo {
  /** One word for what it does. */
  verb: string;
  /** One line shown on the stage while it is selected. */
  tip: string;
}

const INFO: Record<string, ArsenalInfo> = {
  slash: { verb: 'Sever', tip: 'Cuts rock and wood. What you cut loose will fall.' },
  push: { verb: 'Hurl', tip: 'Throws loose rock, sand and water along the line.' },
  fire: { verb: 'Kindle', tip: 'Lights wood and leaves. Flames spread on their own.' },
  water: { verb: 'Pour', tip: 'Drops a sheet of water that runs downhill and douses flame.' },
  null: { verb: 'Erase', tip: 'Quietly wipes the strip away. No scar, no splatter.' },
};

const AIM_HINT = 'Drag to aim, hold to charge, release to strike.';

export interface Arsenal {
  node: HTMLElement;
  /** Select by ability id; returns false if there is no such card. */
  select(id: AbilityId): boolean;
  /** Select the nth card (0-based), used by the number keys. */
  selectIndex(n: number): void;
  /** Tell the arsenal the player has run out of ink, so the cards look spent. */
  setSpent(spent: boolean): void;
}

export function arsenal(onPick: (id: AbilityId, tip: string) => void): Arsenal {
  const node = h('div', { class: 'arsenal', role: 'radiogroup', 'aria-label': 'Abilities' });
  const cards: { id: AbilityId; btn: HTMLButtonElement; tip: string }[] = [];

  activeAbilities(false).forEach((a, i) => {
    const info = INFO[a.id];
    const tip = `${info?.tip ?? a.name} ${AIM_HINT}`;
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'blade',
        role: 'radio',
        'aria-checked': 'false',
        'data-ability': a.id,
        title: `${a.name} (${i + 1})`,
        style: `--blade: ${lineColor(a.id)}`,
      },
      h('span', { class: 'blade-glyph', 'aria-hidden': 'true' }, a.icon ?? a.name.slice(0, 1)),
      h('span', { class: 'blade-name' }, a.name),
      h('span', { class: 'blade-verb' }, info?.verb ?? ''),
      h('kbd', { class: 'blade-key', 'aria-hidden': 'true' }, String(i + 1)),
    );
    btn.addEventListener('click', () => pick(a.id));
    cards.push({ id: a.id, btn, tip });
    node.append(btn);
  });

  function pick(id: AbilityId): boolean {
    const hit = cards.find((c) => c.id === id);
    if (!hit) return false;
    for (const c of cards) {
      const on = c === hit;
      c.btn.classList.toggle('on', on);
      c.btn.setAttribute('aria-checked', String(on));
    }
    onPick(hit.id, hit.tip);
    return true;
  }

  return {
    node,
    select: pick,
    selectIndex: (n) => {
      if (cards[n]) pick(cards[n].id);
    },
    setSpent: (spent) => node.classList.toggle('spent', spent),
  };
}
