import { describe, expect, it } from 'vitest';
import { languages } from '../src/content';
import { validatePack } from '../src/content/validate';
import { buildLexicon } from '../src/content/lexicon';

describe('content validation', () => {
  for (const [code, pack] of Object.entries(languages)) {
    it(`pack "${code}" passes validation`, () => {
      expect(validatePack(pack)).toEqual([]);
    });
  }

  it('Italian pack meets the seed-content minimums', () => {
    const it = languages.it;
    expect(it.vocab.length).toBeGreaterThanOrEqual(140);
    expect(it.verbs.length).toBe(20);
    expect(it.grammar.length).toBeGreaterThanOrEqual(6);
    expect(it.interleave.length).toBeGreaterThanOrEqual(3);
    expect(it.passages.length).toBeGreaterThanOrEqual(6);
    for (const level of ['A1', 'A1+', 'A2']) {
      expect(it.passages.filter((p) => p.level === level).length).toBeGreaterThanOrEqual(2);
    }
    expect(it.production.length).toBeGreaterThanOrEqual(25);
    expect(it.scenarios.length).toBeGreaterThanOrEqual(5);
    expect(it.pronunciation.length).toBeGreaterThanOrEqual(12);
    expect(it.cando.length).toBeGreaterThanOrEqual(6);
  });

  it('passages are 60 to 180 words long', () => {
    for (const p of languages.it.passages) {
      const words = p.sentences.map((s) => s.l2).join(' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
      expect(words, p.id).toBeGreaterThanOrEqual(60);
      expect(words, p.id).toBeLessThanOrEqual(180);
    }
  });

  it('the validator catches broken content', () => {
    const pack = languages.it;
    const broken = {
      ...pack,
      vocab: pack.vocab.map((v, i) => (i === 3 ? { ...v, rank: 999 } : v)),
      passages: [
        {
          ...pack.passages[0],
          sentences: [{ l2: 'Zibaldone!', en: '?' }],
          questions: [{ q: 'x', options: ['a'], answerIndex: 2, explanation: '' }],
        },
      ],
    };
    const errors = validatePack(broken);
    expect(errors.some((e) => e.includes('ranks'))).toBe(true);
    expect(errors.some((e) => e.includes('zibaldone'))).toBe(true);
    expect(errors.some((e) => e.includes('answerIndex'))).toBe(true);
  });

  it('lexicon merges vocab and verbs in frequency order', () => {
    const lex = buildLexicon(languages.it);
    expect(lex.length).toBe(languages.it.vocab.length + languages.it.verbs.length);
    expect(lex.map((l) => l.order)).toEqual(lex.map((_, i) => i + 1));
    expect(lex[0].lemma).toBe('di');
    expect(lex.find((l) => l.lemma === 'essere')!.order).toBeLessThan(10);
    // Nouns carry their article for display and production answers.
    const casa = lex.find((l) => l.lemma === 'casa')!;
    expect(casa.display).toBe('la casa');
    expect(casa.acceptL2).toContain('la casa');
    expect(lex.find((l) => l.lemma === 'anno')!.display).toBe("l'anno");
  });
});
