/**
 * Player names for the gallery: a random pair of Chinese words, like 清風 劍客 ("clear wind,
 * swordsman"). Players do not type a name; each browser gets one and keeps it, so a player's
 * paintings are grouped under the same name.
 */
const SCENES = [
  '清風', '孤雲', '寒江', '明月', '幽谷', '秋霜', '靜夜', '淡墨', '疏雨', '暮煙',
  '蒼松', '素雪', '遠山', '飛鴻', '野鶴', '朝露', '殘荷', '空山', '流泉', '碧波',
] as const;

const PEOPLE = [
  '劍客', '墨客', '漁翁', '行者', '隱士', '旅人', '琴師', '筆翁', '山人', '詩客',
  '酒仙', '禪師', '俠客', '樵夫', '畫師', '書生', '刀客', '牧童', '遊子', '老僧',
] as const;

const KEY = 'blade-and-brush.alias.v1';

/** A random two-word name. Pass a 0..1 source to make it repeatable (tests). */
export function randomAlias(rand: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  return `${pick(SCENES)} ${pick(PEOPLE)}`;
}

/** This browser's name: made on first use and remembered (falls back to a fresh one if storage is blocked). */
export function playerAlias(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const made = randomAlias();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return randomAlias();
  }
}
