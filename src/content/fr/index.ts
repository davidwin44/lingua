import type {
  CanDo,
  GrammarLesson,
  InterleaveSet,
  LangMeta,
  LanguagePack,
  Passage,
  PronItem,
  ProductionItem,
  Scenario,
  Verb,
  VocabItem,
} from '../types';
import meta from './meta.json';
import vocab from './vocab.json';
import verbs from './verbs.json';
import interleave from './interleave.json';
import production from './production.json';
import scenarios from './scenarios.json';
import pronunciation from './pronunciation.json';
import cando from './cando.json';

// Adding a lesson or passage = dropping a JSON file in the folder.
const grammarFiles = import.meta.glob<GrammarLesson>('./grammar/*.json', { eager: true, import: 'default' });
const passageFiles = import.meta.glob<Passage>('./passages/*.json', { eager: true, import: 'default' });

/** JSON imports are structurally typed; the validator checks their shape at test time. */
function as<T>(value: unknown): T {
  return value as T;
}

export const frenchPack: LanguagePack = {
  meta: as<LangMeta>(meta),
  vocab: as<VocabItem[]>(vocab),
  verbs: as<Verb[]>(verbs),
  grammar: Object.values(grammarFiles).sort((a, b) => a.order - b.order),
  interleave: as<InterleaveSet[]>(interleave),
  passages: Object.values(passageFiles),
  production: as<ProductionItem[]>(production),
  scenarios: as<Scenario[]>(scenarios),
  pronunciation: as<PronItem[]>(pronunciation),
  cando: as<CanDo[]>(cando),
};
