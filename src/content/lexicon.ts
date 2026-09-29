import type { Bilingual, DrillItem, GrammarLesson, LanguagePack, PartOfSpeech, Verb } from './types';
import { canonicalEnglish } from '../lib/grading';

/**
 * A learnable word: every vocab item and every verb, merged into one frequency-ordered list.
 * Principle 4 (frequency first): new words are introduced strictly in `order`.
 */
export interface LexItem {
  id: string;
  kind: 'vocab' | 'verb';
  /** 1-based position in the merged frequency list. */
  order: number;
  lemma: string;
  /** Lemma with its article for nouns, e.g. "la casa", "l'anno". */
  display: string;
  pos: PartOfSpeech;
  gender?: 'm' | 'f';
  plural?: string;
  translations: string[];
  /** Accepted English answers for recognition cards. */
  acceptEn: string[];
  /** Accepted target-language answers for production cards. */
  acceptL2: string[];
  /** Disambiguation shown on production cues when another word shares a meaning. */
  prodHint?: string;
  note?: string;
  example: Bilingual;
  verb?: Verb;
  tags: string[];
}

function withArticle(article: string | undefined, lemma: string): string {
  if (!article) return lemma;
  return article.endsWith("'") ? `${article}${lemma}` : `${article} ${lemma}`;
}

const cache = new WeakMap<LanguagePack, LexItem[]>();

export function buildLexicon(pack: LanguagePack): LexItem[] {
  const cached = cache.get(pack);
  if (cached) return cached;

  const vocabItems = pack.vocab.map((v) => ({
    sortRank: v.rank,
    tie: 0,
    item: {
      id: v.id,
      kind: 'vocab' as const,
      order: 0,
      lemma: v.lemma,
      display: withArticle(v.article, v.lemma),
      pos: v.pos,
      gender: v.gender,
      plural: v.plural,
      translations: v.translations,
      acceptEn: v.translations,
      acceptL2: v.article ? [v.lemma, withArticle(v.article, v.lemma)] : [v.lemma],
      note: v.note,
      example: v.example,
      tags: v.tags,
    } satisfies LexItem,
  }));
  const verbItems = pack.verbs.map((v) => ({
    sortRank: v.rank,
    tie: 1,
    item: {
      id: v.id,
      kind: 'verb' as const,
      order: 0,
      lemma: v.infinitive,
      display: v.infinitive,
      pos: 'verb' as const,
      translations: [v.translation],
      acceptEn: [v.translation, ...(v.alsoAccept ?? [])],
      acceptL2: [v.infinitive],
      note: `${v.auxiliary} + ${v.pastParticiple} in the ${pack.meta.pastTense}.`,
      example: v.example,
      verb: v,
      tags: ['verb'],
    } satisfies LexItem,
  }));

  const merged = [...vocabItems, ...verbItems]
    .sort((a, b) => a.sortRank - b.sortRank || a.tie - b.tie)
    .map((x, i) => ({ ...x.item, order: i + 1 }));

  // Production cues are English; when two words share a meaning ("now" = ora / adesso),
  // show the first letter so the learner knows which one is wanted.
  const byMeaning = new Map<string, string[]>();
  for (const item of merged) {
    for (const t of item.acceptEn) {
      const key = canonicalEnglish(t);
      byMeaning.set(key, [...(byMeaning.get(key) ?? []), item.id]);
    }
  }
  const result = merged.map((item) => {
    const clash = item.translations.some((t) => (byMeaning.get(canonicalEnglish(t)) ?? []).length > 1);
    return clash ? { ...item, prodHint: `starts with “${item.lemma.slice(0, 1)}…”` } : item;
  });

  cache.set(pack, result);
  return result;
}

export function lexById(pack: LanguagePack): Map<string, LexItem> {
  return new Map(buildLexicon(pack).map((l) => [l.id, l]));
}

export interface DrillRef {
  drill: DrillItem;
  lesson: GrammarLesson;
}

export function drillIndex(pack: LanguagePack): Map<string, DrillRef> {
  const map = new Map<string, DrillRef>();
  for (const lesson of pack.grammar) {
    for (const drill of lesson.drills) map.set(drill.id, { drill, lesson });
  }
  return map;
}
