/**
 * Known-word coverage of a passage.
 *
 * Principle 8: graded input works best at about 95%+ known-word coverage (Nation 2006;
 * Laufer & Ravenhorst-Kalovski 2010), with tap-to-gloss for the rest and comprehension
 * checks for accountability. A token is "known" when its lemma has a card in the Review
 * state; proper nouns count as known.
 */
import type { Passage } from '../content/types';
import { tokenize } from './text';

export type CoverageBadge = 'Comfortable' | 'Stretch' | 'Hard';

export interface Coverage {
  known: number;
  total: number;
  /** 0..1 */
  ratio: number;
  badge: CoverageBadge;
  unknownLemmas: string[];
}

export function badgeFor(ratio: number): CoverageBadge {
  if (ratio >= 0.95) return 'Comfortable';
  if (ratio >= 0.9) return 'Stretch';
  return 'Hard';
}

export function passageCoverage(passage: Passage, knownLemmas: ReadonlySet<string>): Coverage {
  let known = 0;
  let total = 0;
  const unknown = new Set<string>();
  for (const s of passage.sentences) {
    for (const tok of tokenize(s.l2)) {
      total++;
      const g = passage.gloss[tok];
      if (g && (g.proper || knownLemmas.has(g.lemma.toLowerCase()))) known++;
      else unknown.add(g?.lemma ?? tok);
    }
  }
  const ratio = total === 0 ? 1 : known / total;
  return { known, total, ratio, badge: badgeFor(ratio), unknownLemmas: [...unknown] };
}
