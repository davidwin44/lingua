import { describe, expect, it } from 'vitest';
import { languages } from '../src/content';
import { drillIndex } from '../src/content/lexicon';
import { mulberry32 } from '../src/lib/fsrs';
import { interleaveByCategory, longestRun } from '../src/lib/interleave';

type Item = { id: string; cat: string };
const cat = (i: Item) => i.cat;

function blocked(counts: Record<string, number>): Item[] {
  return Object.entries(counts).flatMap(([c, n]) => Array.from({ length: n }, (_, i) => ({ id: `${c}${i}`, cat: c })));
}

describe('interleaveByCategory', () => {
  it('keeps every item exactly once', () => {
    const items = blocked({ a: 5, b: 5, c: 3 });
    const out = interleaveByCategory(items, cat, mulberry32(1));
    expect(out).toHaveLength(items.length);
    expect(new Set(out.map((i) => i.id)).size).toBe(items.length);
  });

  it('never produces runs from one category when alternatives exist', () => {
    for (let seed = 0; seed < 100; seed++) {
      const out = interleaveByCategory(blocked({ essere: 6, avere: 6 }), cat, mulberry32(seed));
      expect(longestRun(out, cat)).toBe(1);
      const uneven = interleaveByCategory(blocked({ x: 5, y: 4, z: 2 }), cat, mulberry32(seed));
      expect(longestRun(uneven, cat)).toBe(1);
    }
  });

  it('only allows runs once one category is all that is left', () => {
    const out = interleaveByCategory(blocked({ a: 6, b: 2 }), cat, mulberry32(7));
    // 6 vs 2: best possible is a b a b a a a a → the tail run is unavoidable, the start alternates.
    expect(out.slice(0, 4).map((i) => i.cat)).toEqual(['a', 'b', 'a', 'b']);
  });

  it('works on the real interleave sets', () => {
    const index = drillIndex(languages.it);
    for (const set of languages.it.interleave) {
      const items = set.itemIds.map((id) => index.get(id)!.drill);
      const out = interleaveByCategory(items, (d) => d.category ?? '', mulberry32(11));
      expect(longestRun(out, (d) => d.category ?? '')).toBeLessThanOrEqual(2);
    }
  });
});
