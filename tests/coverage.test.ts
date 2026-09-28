import { describe, expect, it } from 'vitest';
import type { Passage } from '../src/content/types';
import { badgeFor, passageCoverage } from '../src/lib/coverage';
import { segment, tokenize, wordGroups } from '../src/lib/text';
import { estimatedTextCoverage, harmonic } from '../src/lib/progress';

const fixture: Passage = {
  id: 'p-test',
  level: 'A1',
  title: 'Test',
  summary: '',
  sentences: [
    { l2: "Marco è a casa con l'amico.", en: '' },
    { l2: 'Il gatto dorme.', en: '' },
  ],
  gloss: {
    marco: { lemma: 'Marco', en: 'Marco', proper: true },
    'è': { lemma: 'essere', en: 'is' },
    a: { lemma: 'a', en: 'at' },
    casa: { lemma: 'casa', en: 'home' },
    con: { lemma: 'con', en: 'with' },
    "l'": { lemma: 'il', en: 'the' },
    amico: { lemma: 'amico', en: 'friend' },
    il: { lemma: 'il', en: 'the' },
    gatto: { lemma: 'gatto', en: 'cat' },
    dorme: { lemma: 'dormire', en: 'sleeps' },
  },
  questions: [],
};

describe('tokenizer', () => {
  it('keeps elision apostrophes with the article', () => {
    expect(tokenize("Marco è a casa con l'amico.")).toEqual(['marco', 'è', 'a', 'casa', 'con', "l'", 'amico']);
    expect(tokenize("Parlo un po' di italiano")).toContain("po'");
    expect(tokenize("C’è molta gente")).toEqual(["c'", 'è', 'molta', 'gente']);
  });

  it('keeps punctuation attached to its word so lines never break between them', () => {
    const groups = wordGroups('«Con la crema, grazie.»');
    const words = groups.filter((g) => !g.space).map((g) => (g.space ? '' : g.pieces.map((p) => p.text).join('')));
    expect(words).toEqual(['«Con', 'la', 'crema,', 'grazie.»']);
    expect(groups.map((g) => (g.space ? g.text : g.pieces.map((p) => p.text).join(''))).join('')).toBe('«Con la crema, grazie.»');
  });

  it('segments text losslessly for rendering', () => {
    const text = '«Buongiorno! Cosa prende?» chiede il barista.';
    expect(segment(text).map((p) => p.text).join('')).toBe(text);
  });
});

describe('passage coverage', () => {
  it('counts known lemmas and proper nouns on a fixture', () => {
    // 10 tokens: marco è a casa con l' amico il gatto dorme
    const known = new Set(['essere', 'a', 'casa', 'il']);
    const c = passageCoverage(fixture, known);
    expect(c.total).toBe(10);
    // marco (proper) + è + a + casa + l' + il = 6
    expect(c.known).toBe(6);
    expect(c.ratio).toBeCloseTo(0.6);
    expect(c.badge).toBe('Hard');
    expect(c.unknownLemmas.sort()).toEqual(['amico', 'con', 'dormire', 'gatto']);
  });

  it('is 100% when every lemma is known', () => {
    const all = new Set(Object.values(fixture.gloss).map((g) => g.lemma.toLowerCase()));
    expect(passageCoverage(fixture, all).ratio).toBe(1);
  });

  it('assigns badges at 95% and 90%', () => {
    expect(badgeFor(0.95)).toBe('Comfortable');
    expect(badgeFor(0.94)).toBe('Stretch');
    expect(badgeFor(0.9)).toBe('Stretch');
    expect(badgeFor(0.89)).toBe('Hard');
  });
});

describe('estimated text coverage (Zipf)', () => {
  it('top 1,000 words cover about 80% of text with the calibrated list size', () => {
    const top1000 = Array.from({ length: 1000 }, (_, i) => ({ order: i + 1 }));
    // Only `order` is used by the estimator.
    const cov = estimatedTextCoverage(top1000 as never, 6500);
    expect(cov).toBeGreaterThan(0.78);
    expect(cov).toBeLessThan(0.82);
    expect(harmonic(1)).toBe(1);
  });
});
