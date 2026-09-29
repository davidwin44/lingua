import type { LanguagePack } from './types';
import { tokenize } from '../lib/text';

/**
 * Structural checks for a language pack. Returns a list of human-readable problems
 * (empty = valid). Run for every registered pack in tests/content.test.ts.
 */
export function validatePack(pack: LanguagePack): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const { meta } = pack;
  if (meta.status !== 'full' && meta.status !== 'preview') errors.push('Meta: status must be "full" or "preview"');
  if (!meta.greetings?.morning || !meta.greetings?.afternoon || !meta.greetings?.evening) errors.push('Meta: needs three greetings');
  if (!meta.registers?.informal?.label || !meta.registers?.formal?.label) errors.push('Meta: needs informal and formal registers');
  if (!meta.auxiliaries?.length) errors.push('Meta: needs at least one auxiliary');
  if (!meta.pastTense) errors.push('Meta: needs the name of the compound past');
  const claim = (id: string, where: string) => {
    if (!id) errors.push(`${where}: missing id`);
    else if (seen.has(id)) errors.push(`Duplicate id "${id}" (${where} and ${seen.get(id)})`);
    else seen.set(id, where);
  };

  // Vocabulary: unique ids, ranks 1..N with no gaps.
  pack.vocab.forEach((v) => claim(v.id, 'vocab'));
  const ranks = pack.vocab.map((v) => v.rank).sort((a, b) => a - b);
  ranks.forEach((r, i) => {
    if (r !== i + 1) errors.push(`Vocab ranks must be 1..N with no gaps: expected ${i + 1}, found ${r}`);
  });
  for (const v of pack.vocab) {
    if (v.translations.length === 0) errors.push(`Vocab ${v.id}: no translations`);
    if (!v.example?.l2 || !v.example?.en) errors.push(`Vocab ${v.id}: missing example`);
    if (v.pos === 'noun' && (!v.gender || !v.article)) errors.push(`Vocab ${v.id}: nouns need gender and article`);
  }

  // Verbs: unique ids and ranks; full conjugations.
  const verbRanks = new Set<number>();
  for (const v of pack.verbs) {
    claim(v.id, 'verbs');
    if (verbRanks.has(v.rank)) errors.push(`Verb ${v.id}: duplicate rank ${v.rank}`);
    verbRanks.add(v.rank);
    if (!meta.auxiliaries?.includes(v.auxiliary)) errors.push(`Verb ${v.id}: auxiliary "${v.auxiliary}" is not in meta.auxiliaries`);
    for (const person of pack.meta.persons) {
      if (!v.present[person]) errors.push(`Verb ${v.id}: missing present form for ${person}`);
      if (!v.imperfect[person]) errors.push(`Verb ${v.id}: missing imperfect form for ${person}`);
    }
  }

  // Grammar lessons and drills.
  const drills = new Map<string, { category?: string }>();
  for (const lesson of pack.grammar) {
    claim(lesson.id, 'grammar lesson');
    if (lesson.examples.length < 3 || lesson.examples.length > 5) {
      errors.push(`Lesson ${lesson.id}: needs 3 to 5 worked examples`);
    }
    if (lesson.drills.length < 8 || lesson.drills.length > 12) {
      errors.push(`Lesson ${lesson.id}: needs 8 to 12 drills (has ${lesson.drills.length})`);
    }
    for (const d of lesson.drills) {
      claim(d.id, `drill in ${lesson.id}`);
      drills.set(d.id, { category: d.category });
      if (!Array.isArray(d.hints) || d.hints.length !== 2 || d.hints.some((h) => !h)) {
        errors.push(`Drill ${d.id}: must have exactly 2 hints`);
      }
      if (!Array.isArray(d.answer) || d.answer.length < 1) errors.push(`Drill ${d.id}: needs at least 1 accepted answer`);
      if (d.type === 'choose') {
        if (!d.options || d.options.length < 2) errors.push(`Drill ${d.id}: choose drills need options`);
        else if (!d.answer.some((a) => d.options?.includes(a))) errors.push(`Drill ${d.id}: answer must be one of the options`);
        if (d.justify && (d.justify.answerIndex < 0 || d.justify.answerIndex >= d.justify.options.length)) {
          errors.push(`Drill ${d.id}: justify answerIndex out of range`);
        }
      }
    }
  }
  const lessonIds = new Set(pack.grammar.map((l) => l.id));

  // Interleave sets: existing drills, ≥ 2 categories represented.
  for (const set of pack.interleave) {
    claim(set.id, 'interleave set');
    const cats = new Set<string>();
    for (const itemId of set.itemIds) {
      const d = drills.get(itemId);
      if (!d) {
        errors.push(`Interleave ${set.id}: unknown drill id "${itemId}"`);
        continue;
      }
      if (!d.category) errors.push(`Interleave ${set.id}: drill ${itemId} has no category`);
      else if (!set.categories.includes(d.category)) {
        errors.push(`Interleave ${set.id}: drill ${itemId} category "${d.category}" not in set categories`);
      } else cats.add(d.category);
    }
    if (cats.size < 2) errors.push(`Interleave ${set.id}: needs items from at least 2 categories`);
    for (const l of set.introducedIn) if (!lessonIds.has(l)) errors.push(`Interleave ${set.id}: unknown lesson ${l}`);
  }

  // Passages: every token glossed; valid questions.
  for (const p of pack.passages) {
    claim(p.id, 'passage');
    const missing = new Set<string>();
    for (const s of p.sentences) {
      for (const tok of tokenize(s.l2)) if (!p.gloss[tok]) missing.add(tok);
    }
    if (missing.size > 0) errors.push(`Passage ${p.id}: tokens without gloss: ${[...missing].join(', ')}`);
    if (p.questions.length < 3 || p.questions.length > 4) errors.push(`Passage ${p.id}: needs 3 or 4 questions`);
    p.questions.forEach((q, i) => {
      if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length) {
        errors.push(`Passage ${p.id}: question ${i + 1} has an invalid answerIndex`);
      }
    });
  }
  const passageIds = new Set(pack.passages.map((p) => p.id));

  for (const item of pack.production) {
    claim(item.id, 'production');
    if (item.accepted.length < 1) errors.push(`Production ${item.id}: needs at least 1 accepted answer`);
    if (item.lessonId && !lessonIds.has(item.lessonId)) errors.push(`Production ${item.id}: unknown lesson`);
  }
  const productionIds = new Set(pack.production.map((p) => p.id));

  for (const s of pack.scenarios) {
    claim(s.id, 'scenario');
    if (s.register !== 'informal' && s.register !== 'formal') errors.push(`Scenario ${s.id}: register must be informal or formal`);
  }
  const scenarioIds = new Set(pack.scenarios.map((s) => s.id));

  for (const item of pack.pronunciation) {
    claim(item.id, 'pronunciation');
    if (item.kind === 'pair' && item.words.length !== 2) errors.push(`Pronunciation ${item.id}: pairs need 2 words`);
    if (item.words.length === 0) errors.push(`Pronunciation ${item.id}: no words`);
  }

  for (const c of pack.cando) {
    claim(c.id, 'can-do');
    const req = c.requires;
    const total = (req.lessons?.length ?? 0) + (req.passages?.length ?? 0) + (req.production?.length ?? 0);
    if (total === 0) errors.push(`Can-do ${c.id}: must link to at least one lesson, passage or production item`);
    req.lessons?.forEach((id) => !lessonIds.has(id) && errors.push(`Can-do ${c.id}: unknown lesson ${id}`));
    req.passages?.forEach((id) => !passageIds.has(id) && errors.push(`Can-do ${c.id}: unknown passage ${id}`));
    req.production?.forEach((id) => !productionIds.has(id) && errors.push(`Can-do ${c.id}: unknown production item ${id}`));
    c.practise?.forEach((id) => !scenarioIds.has(id) && errors.push(`Can-do ${c.id}: unknown scenario ${id}`));
  }

  return errors;
}
