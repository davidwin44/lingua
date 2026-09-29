import type { LanguagePack } from './types';
import { italianPack } from './it';
import { frenchPack } from './fr';
import { spanishPack } from './es';

/**
 * Language registry. Adding a language = add a folder under src/content/<code>/
 * with the same files as it/, then add one line here.
 */
export const languages: Record<string, LanguagePack> = {
  it: italianPack,
  fr: frenchPack,
  es: spanishPack,
};

/** Every course in picker order: complete courses first, then previews. */
export const languageList: LanguagePack[] = Object.values(languages).sort(
  (a, b) => Number(a.meta.status === 'preview') - Number(b.meta.status === 'preview'),
);

export const DEFAULT_LANG = 'it';

export function getPack(code: string): LanguagePack {
  return languages[code] ?? languages[DEFAULT_LANG];
}
