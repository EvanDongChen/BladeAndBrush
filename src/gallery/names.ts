/**
 * Player names for the gallery. A player signs a painting by choosing a Chinese adjective and one of
 * the twelve zodiac animals, which make a name like 勇敢的虎 ("the brave tiger"). The choice is
 * remembered in this browser, and a first-time player starts from a random pair.
 */
export interface Word {
  zh: string;
  en: string;
}

export const ADJECTIVES: readonly Word[] = [
  { zh: '勇敢', en: 'brave' },
  { zh: '聰明', en: 'clever' },
  { zh: '安靜', en: 'quiet' },
  { zh: '敏捷', en: 'nimble' },
  { zh: '溫柔', en: 'gentle' },
  { zh: '驕傲', en: 'proud' },
  { zh: '快樂', en: 'happy' },
  { zh: '神祕', en: 'mysterious' },
  { zh: '堅強', en: 'strong' },
  { zh: '孤獨', en: 'lonely' },
  { zh: '自由', en: 'free' },
  { zh: '優雅', en: 'elegant' },
  { zh: '沉穩', en: 'steady' },
  { zh: '靈巧', en: 'deft' },
  { zh: '傳奇', en: 'legendary' },
  { zh: '幸運', en: 'lucky' },
];

/** The Chinese zodiac in its usual order. */
export const ZODIAC: readonly Word[] = [
  { zh: '鼠', en: 'Rat' },
  { zh: '牛', en: 'Ox' },
  { zh: '虎', en: 'Tiger' },
  { zh: '兔', en: 'Rabbit' },
  { zh: '龍', en: 'Dragon' },
  { zh: '蛇', en: 'Snake' },
  { zh: '馬', en: 'Horse' },
  { zh: '羊', en: 'Goat' },
  { zh: '猴', en: 'Monkey' },
  { zh: '雞', en: 'Rooster' },
  { zh: '狗', en: 'Dog' },
  { zh: '豬', en: 'Pig' },
];

/** A choice from the two menus: indexes into ADJECTIVES and ZODIAC. */
export interface NameChoice {
  adjective: number;
  zodiac: number;
}

const KEY = 'blade-and-brush.name.v1';

/** The name a choice makes, like 勇敢的虎. Out-of-range indexes are clamped. */
export function aliasOf(choice: NameChoice): string {
  const adjective = ADJECTIVES[Math.max(0, Math.min(ADJECTIVES.length - 1, Math.trunc(choice.adjective) || 0))];
  const animal = ZODIAC[Math.max(0, Math.min(ZODIAC.length - 1, Math.trunc(choice.zodiac) || 0))];
  return `${adjective.zh}的${animal.zh}`;
}

/** A random choice. Pass a 0..1 source to make it repeatable (tests). */
export function randomChoice(rand: () => number = Math.random): NameChoice {
  const pick = (n: number) => Math.min(n - 1, Math.floor(rand() * n));
  return { adjective: pick(ADJECTIVES.length), zodiac: pick(ZODIAC.length) };
}

/** What this browser chose last, or a random pair the first time (not saved until the player picks). */
export function savedChoice(): NameChoice {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) {
      const { adjective, zodiac } = parsed as Partial<NameChoice>;
      if (Number.isInteger(adjective) && Number.isInteger(zodiac)) {
        return { adjective: adjective as number, zodiac: zodiac as number };
      }
    }
  } catch {
    // blocked or damaged storage: fall through to a random pair
  }
  return randomChoice();
}

/** Remember a choice for next time. Storage may be blocked; the name is still used for this painting. */
export function saveChoice(choice: NameChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // ignore
  }
}
