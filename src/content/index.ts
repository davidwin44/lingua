import type { LanguagePack } from './types';
import { italianPack } from './it';

/**
 * Language registry. Adding a language = add a folder under src/content/<code>/
 * with the same files as it/, then add one line here.
 */
export const languages: Record<string, LanguagePack> = {
  it: italianPack,
};

export const DEFAULT_LANG = 'it';

export function getPack(code: string): LanguagePack {
  return languages[code] ?? languages[DEFAULT_LANG];
}
