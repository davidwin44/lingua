/**
 * Content format for a language pack. One folder per language under src/content/<code>/.
 *
 * Bilingual strings use `l2` (the target language) and `en` (the learner's base language),
 * so the same types work for every pack.
 */

export interface Bilingual {
  /** Target-language text. */
  l2: string;
  /** Base-language (English) translation. */
  en: string;
}

/** How to address someone in one register, for the tutor and scenario labels. */
export interface RegisterInfo {
  /** The pronoun, e.g. "tu", "Lei", "vous", "usted". */
  label: string;
  /** A few characteristic forms, e.g. "scusi, può, sa". */
  forms: string;
}

export interface LangMeta {
  code: string;
  name: string;
  /**
   * "full" is a complete course. "preview" is an early pack: it runs end to end but has
   * only starter content, and the language picker says so.
   */
  status: 'full' | 'preview';
  /**
   * A striped flag drawn in the language picker: equal stripes unless `weights` says
   * otherwise (Spain's is 1:2:1).
   */
  flag: { stripes: 'vertical' | 'horizontal'; colors: string[]; weights?: number[] };
  /** Home greeting by time of day, in the target language. */
  greetings: { morning: string; afternoon: string; evening: string };
  /** Informal and formal address; scenarios pick one. */
  registers: { informal: RegisterInfo; formal: RegisterInfo };
  /** Auxiliary verbs of the compound past; every verb's `auxiliary` is one of these. */
  auxiliaries: string[];
  /** Name of the compound past tense, e.g. "passato prossimo". */
  pastTense: string;
  /** An example self-correction prompt the tutor can model its own prompts on. */
  tutorPromptExample: string;
  /** BCP-47 tag for speechSynthesis. */
  ttsLang: string;
  /** BCP-47 tag for SpeechRecognition. */
  srLang: string;
  baseLang: string;
  /** Characters offered as tap-to-insert keys under answer inputs. */
  accentKeys: string[];
  /** Person keys used in verb conjugation tables, in display order. */
  persons: string[];
  /** Display labels for `persons`. */
  personLabels: string[];
  /**
   * Size of the lemma frequency list used for the Zipf text-coverage estimate.
   * Calibrated so that the top 1,000 lemmas cover ~80% of running text.
   */
  zipfListSize: number;
  note?: string;
}

export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'pron'
  | 'prep'
  | 'conj'
  | 'art'
  | 'num'
  | 'interj'
  | 'det';

export interface VocabItem {
  id: string;
  /** Approximate frequency rank, 1..N with no gaps. */
  rank: number;
  lemma: string;
  pos: PartOfSpeech;
  gender?: 'm' | 'f';
  /** Singular definite article, e.g. "il", "lo", "la", "l'". */
  article?: string;
  plural?: string;
  translations: string[];
  /** Short usage note shown on the card back. */
  note?: string;
  example: Bilingual;
  tags: string[];
}

export type Conjugation = Record<string, string>;

export interface Verb {
  id: string;
  /**
   * Approximate position in the combined (vocab + verbs) frequency list.
   * New words are introduced in this merged order.
   */
  rank: number;
  infinitive: string;
  translation: string;
  /** Extra accepted English meanings for recognition cards. */
  alsoAccept?: string[];
  /** One of `meta.auxiliaries`. */
  auxiliary: string;
  pastParticiple: string;
  present: Conjugation;
  imperfect: Conjugation;
  example: Bilingual;
}

export type DrillType = 'cloze' | 'transform' | 'choose';

export interface DrillItem {
  id: string;
  type: DrillType;
  /** Prompt text. Cloze prompts contain "___" for the gap. */
  prompt: string;
  /** English gloss of the sentence (shown under the prompt). */
  en?: string;
  /** Accepted answers (at least one). */
  answer: string[];
  /** Exactly two prompts: [metalinguistic prompt, narrower prompt]. */
  hints: [string, string];
  /** Rule explanation shown on reveal. */
  explanation: string;
  /** Confusable category, used by interleaved practice. */
  category?: string;
  /** For 'choose' drills: the options to pick from. */
  options?: string[];
  /** For 'choose' drills: the "justify" step (pick the reason). */
  justify?: { question: string; options: string[]; answerIndex: number };
}

export interface GrammarTable {
  headers: string[];
  rows: string[][];
}

export interface GrammarLesson {
  id: string;
  order: number;
  title: string;
  level: string;
  /** Markdown-lite: paragraphs, **bold**, *italic*, "- " bullet lists. ≤ ~200 words. */
  explanation: string;
  table?: GrammarTable;
  examples: Bilingual[];
  drills: DrillItem[];
}

export interface InterleaveSet {
  id: string;
  title: string;
  description: string;
  categories: string[];
  /** Drill item ids (from grammar lessons). */
  itemIds: string[];
  /** Lessons that introduce these categories one at a time (blocked introduction). */
  introducedIn: string[];
}

export interface GlossEntry {
  lemma: string;
  en: string;
  /** Proper nouns count as known for coverage. */
  proper?: boolean;
}

export interface ComprehensionQuestion {
  q: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export type PassageLevel = 'A1' | 'A1+' | 'A2';

export interface Passage {
  id: string;
  level: PassageLevel;
  title: string;
  summary: string;
  sentences: Bilingual[];
  /** Keyed by lowercased token (with elision apostrophe kept, e.g. "l'"). */
  gloss: Record<string, GlossEntry>;
  questions: ComprehensionQuestion[];
}

export interface ProductionItem {
  id: string;
  en: string;
  accepted: string[];
  /** Metalinguistic prompt shown after the first wrong attempt. */
  hint: string;
  targetStructure: string;
  lessonId?: string;
}

export interface Scenario {
  id: string;
  title: string;
  register: 'informal' | 'formal';
  level: 'A1' | 'A2';
  goal: string;
  /** Role Claude plays. */
  role: string;
  opening: string;
  openingEn: string;
  focus?: string;
}

export interface PronWord {
  text: string;
  en: string;
}

export interface PronItem {
  id: string;
  kind: 'pair' | 'sound';
  title: string;
  /** The sound being practised, e.g. "double consonants", "gli". */
  sound: string;
  words: PronWord[];
  tip: string;
}

export interface CanDo {
  id: string;
  text: string;
  /** All of these must be completed for the statement to be ticked. */
  requires: {
    lessons?: string[];
    passages?: string[];
    production?: string[];
  };
  /** Optional tutor scenarios for further practice (not required). */
  practise?: string[];
}

export interface LanguagePack {
  meta: LangMeta;
  vocab: VocabItem[];
  verbs: Verb[];
  grammar: GrammarLesson[];
  interleave: InterleaveSet[];
  passages: Passage[];
  production: ProductionItem[];
  scenarios: Scenario[];
  pronunciation: PronItem[];
  cando: CanDo[];
}
