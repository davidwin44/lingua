import { describe, expect, it } from 'vitest';
import { autoGrade, canonicalEnglish, checkStrict, levenshtein, normalize, wordDiff } from '../src/lib/grading';

describe('normalize', () => {
  it('ignores case, whitespace and punctuation but keeps accents and elision', () => {
    expect(normalize('  Un caffè,   per favore! ')).toBe('un caffè per favore');
    expect(normalize("L’amico")).toBe(normalize("l' amico"));
    expect(normalize('«Ciao!»')).toBe('ciao');
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('palla', 'pala')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('città', 'citta')).toBe(1);
  });
});

describe('autoGrade', () => {
  it('exact answers grade Good', () => {
    expect(autoGrade('perché', ['perché'])).toMatchObject({ grade: 3, kind: 'exact' });
    expect(autoGrade('  PERCHÉ ', ['perché'])).toMatchObject({ grade: 3, kind: 'exact' });
  });

  it('accents-only mistakes grade Hard and report the exact spelling', () => {
    const r = autoGrade('perche', ['perché']);
    expect(r).toMatchObject({ grade: 2, kind: 'accent', expected: 'perché' });
    expect(autoGrade('citta', ['città']).grade).toBe(2);
  });

  it('a single-character typo grades Hard', () => {
    expect(autoGrade('stazone', ['stazione'])).toMatchObject({ grade: 2, kind: 'typo' });
    expect(autoGrade('biglieto', ['biglietto'])).toMatchObject({ grade: 2, kind: 'typo' });
  });

  it('does not forgive typos on very short words', () => {
    expect(autoGrade('la', ['il']).grade).toBe(1);
    expect(autoGrade('a', ['e']).grade).toBe(1);
  });

  it('wrong answers grade Again', () => {
    expect(autoGrade('casa', ['treno'])).toMatchObject({ grade: 1, kind: 'wrong' });
    expect(autoGrade('', ['treno']).grade).toBe(1);
  });

  it('accepted alternatives work', () => {
    expect(autoGrade('home', ['house', 'home'], { english: true }).grade).toBe(3);
    expect(autoGrade('la casa', ['casa', 'la casa']).grade).toBe(3);
    expect(autoGrade('casa', ['casa', 'la casa']).grade).toBe(3);
  });

  it('English answers ignore "to", articles and parenthetical notes', () => {
    expect(autoGrade('be', ['to be'], { english: true }).grade).toBe(3);
    expect(autoGrade('the house', ['house'], { english: true }).grade).toBe(3);
    expect(autoGrade('you', ['you (informal)'], { english: true }).grade).toBe(3);
    expect(autoGrade('house, home', ['home'], { english: true }).grade).toBe(3);
    expect(canonicalEnglish('To Be')).toBe('be');
  });
});

describe('checkStrict (drills)', () => {
  it('requires the exact form; accents-only is reported but not accepted', () => {
    expect(checkStrict('è andata', ['è andata']).kind).toBe('exact');
    expect(checkStrict('e andata', ['è andata']).kind).toBe('accent');
    expect(checkStrict('è andato', ['è andata']).kind).toBe('wrong');
  });
});

describe('wordDiff', () => {
  it('marks differing words', () => {
    const diff = wordDiff('Maria ha andata a Roma', 'Maria è andata a Roma.');
    expect(diff.map((d) => d.ok)).toEqual([true, false, true, true, true]);
  });
});
