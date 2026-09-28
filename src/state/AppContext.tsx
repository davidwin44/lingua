import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPack } from '../content';
import { buildLexicon, drillIndex, type DrillRef, type LexItem } from '../content/lexicon';
import type { LanguagePack } from '../content/types';
import { browserStorage, loadProgress, saveProgress, type KVStorage } from '../lib/storage';
import type { Progress } from '../lib/types';

export interface AppContextValue {
  pack: LanguagePack;
  lexicon: LexItem[];
  lexMap: Map<string, LexItem>;
  drills: Map<string, DrillRef>;
  progress: Progress;
  /** Apply a pure update (p, now) => p'. Persisted to localStorage automatically. */
  update: (fn: (p: Progress, now: number) => Progress) => void;
  /** Replace all progress (import / reset). */
  replace: (p: Progress) => void;
  saveFailed: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  initialProgress,
  storage,
}: {
  children: ReactNode;
  initialProgress?: Progress;
  storage?: KVStorage | null;
}) {
  const store = useRef<KVStorage | null>(storage === undefined ? browserStorage() : storage);
  const [progress, setProgress] = useState<Progress>(() => initialProgress ?? loadProgress(store.current));
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setSaveFailed(!saveProgress(progress, store.current));
  }, [progress]);

  const update = useCallback((fn: (p: Progress, now: number) => Progress) => {
    setProgress((prev) => fn(prev, Date.now()));
  }, []);
  const replace = useCallback((p: Progress) => setProgress(p), []);

  const pack = getPack(progress.lang);
  const value = useMemo<AppContextValue>(() => {
    const lexicon = buildLexicon(pack);
    return {
      pack,
      lexicon,
      lexMap: new Map(lexicon.map((l) => [l.id, l])),
      drills: drillIndex(pack),
      progress,
      update,
      replace,
      saveFailed,
    };
  }, [pack, progress, update, replace, saveFailed]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
