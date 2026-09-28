/**
 * Interleaved ordering for grammar Mixed Practice.
 *
 * Principle 7: interleaving helps when categories are confusable and must be discriminated
 * (overall g = 0.42, Brunmair & Richter 2019) — e.g. essere vs avere as auxiliaries, or
 * passato prossimo vs imperfetto. It HURTS for word lists (g = -0.39), so it is deliberately
 * NOT used for vocabulary. Vocabulary review just mixes due cards randomly (lib/scheduler.ts).
 *
 * Learners first meet each category in its own lesson (blocked introduction), then practise
 * the mixed version here.
 */

/**
 * Order items so consecutive items come from different categories whenever possible.
 * Greedy: at each step pick, among categories other than the previous one, the one with the
 * most items left (ties broken randomly). This never produces a run of 2+ from one category
 * unless no alternative remains.
 */
export function interleaveByCategory<T>(items: readonly T[], categoryOf: (item: T) => string, rng: () => number = Math.random): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const cat = categoryOf(item);
    buckets.set(cat, [...(buckets.get(cat) ?? []), item]);
  }
  // Shuffle within each category.
  for (const [cat, list] of buckets) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    buckets.set(cat, a);
  }

  const out: T[] = [];
  let prev: string | null = null;
  while (out.length < items.length) {
    const candidates = [...buckets.entries()].filter(([cat, list]) => list.length > 0 && cat !== prev);
    const pool = candidates.length > 0 ? candidates : [...buckets.entries()].filter(([, list]) => list.length > 0);
    const most = Math.max(...pool.map(([, list]) => list.length));
    const top = pool.filter(([, list]) => list.length === most);
    const [cat, list] = top[Math.floor(rng() * top.length)];
    out.push(list.shift() as T);
    prev = cat;
  }
  return out;
}

/** Longest run of consecutive items sharing a category. */
export function longestRun<T>(items: readonly T[], categoryOf: (item: T) => string): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const item of items) {
    const cat = categoryOf(item);
    run = cat === prev ? run + 1 : 1;
    prev = cat;
    best = Math.max(best, run);
  }
  return best;
}
