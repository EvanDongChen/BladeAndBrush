// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { GalleryEntry } from '../src/gallery';

const KEY = 'blade-and-brush.gallery.v1';

function entry(i: number, levelId: string, name: string, strokes: number): GalleryEntry {
  return {
    id: `e${i}`,
    playerName: name,
    levelId,
    seed: 1,
    params: {},
    actionLog: [],
    png: 'data:image/jpeg;base64,AAA',
    result: { pass: true, progress: 1, strokes, budget: 8 },
    scan: null,
    worldHash: 1,
    appVersion: 'test',
    createdAt: 1_000_000 - i, // e0 is the newest
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const names = (el: Element) => [...el.querySelectorAll('.shelf-name')].map((n) => n.textContent);

async function open(entries: GalleryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
  document.body.innerHTML = '<div id="app"></div>';
  const { mountGallery } = await import('../src/pages/gallery');
  mountGallery(document.getElementById('app')!);
  await flush();
}

const five = () => [
  entry(0, 'level-1', '勇敢的虎', 4),
  entry(1, 'level-2', '聰明的龍', 3),
  entry(2, 'level-1', '安靜的兔', 2),
  entry(3, 'level-3', '敏捷的猴', 5),
  entry(4, 'level-2', '溫柔的羊', 6),
];

beforeEach(() => {
  window.scrollTo = () => undefined; // jsdom does not implement it
  localStorage.clear();
});

describe('gallery page', () => {
  it('has an All tab plus one per level, All selected, newest painting on the stage and the rest on the shelf', async () => {
    await open(five());
    const tabs = [...document.querySelectorAll('.gallery-tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(['All', 'The Peak', 'The Eclipse', 'The Drought', 'The Trap']);
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.gallery-stage .gallery-alias')?.textContent).toBe('勇敢的虎');
    expect(names(document.querySelector('.gallery-shelf')!)).toEqual(['聰明的龍', '安靜的兔', '敏捷的猴', '溫柔的羊']);
  });

  it('clicking a shelf painting swaps it with the one being viewed, in the same place', async () => {
    await open(five());
    (document.querySelectorAll('.shelf-item')[1] as HTMLElement).click(); // 安靜的兔
    expect(document.querySelector('.gallery-stage .gallery-alias')?.textContent).toBe('安靜的兔');
    expect(names(document.querySelector('.gallery-shelf')!)).toEqual(['聰明的龍', '勇敢的虎', '敏捷的猴', '溫柔的羊']);
  });

  it('a level tab shows only that level, still stage plus shelf', async () => {
    await open(five());
    (document.querySelectorAll('.gallery-tab')[2] as HTMLElement).click(); // The Eclipse = level-2
    await flush();
    expect(document.querySelectorAll('.gallery-tab')[2].getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.gallery-stage .gallery-alias')?.textContent).toBe('聰明的龍');
    expect(names(document.querySelector('.gallery-shelf')!)).toEqual(['溫柔的羊']);
  });

  it('a level with no paintings says so, and All brings everything back', async () => {
    await open(five());
    (document.querySelectorAll('.gallery-tab')[4] as HTMLElement).click(); // The Trap: none
    await flush();
    expect(document.querySelector('.gallery-stage')?.textContent).toContain('No paintings for The Trap yet.');
    expect(document.querySelectorAll('.shelf-item')).toHaveLength(0);
    (document.querySelectorAll('.gallery-tab')[0] as HTMLElement).click();
    await flush();
    expect(document.querySelectorAll('.shelf-item')).toHaveLength(4);
  });

  it('marks the fewest strokes per level with the 最少 seal', async () => {
    await open(five());
    // viewing 勇敢的虎 (4 strokes) on level-1, where 安靜的兔 took 2: no seal on the stage
    expect(document.querySelector('.gallery-stage .gallery-best')).toBeNull();
    (document.querySelectorAll('.shelf-item')[1] as HTMLElement).click(); // 安靜的兔, the level-1 best
    expect(document.querySelector('.gallery-stage .gallery-best')?.textContent).toBe('最少');
  });
});
