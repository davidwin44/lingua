import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/fsrs';
import { applyReview, completeLesson, createFreshProgress } from '../src/lib/progress';
import {
  STORAGE_KEY,
  exportProgress,
  importProgress,
  loadProgress,
  saveProgress,
  type KVStorage,
} from '../src/lib/storage';

class MemoryStorage implements KVStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BrokenStorage implements KVStorage {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('nope');
  }
}

const NOW = new Date(2026, 4, 1, 10).getTime();

function sampleProgress() {
  let p = createFreshProgress(NOW);
  p = { ...p, goal: { reason: 'travel', unit: 'minutes', target: 90 } };
  p = applyReview(p, 'rec:w-di', 3, NOW, { rng: mulberry32(1) });
  p = completeLesson(p, 'g-articles', 10, 12, NOW);
  return p;
}

describe('storage', () => {
  it('uses a versioned key', () => {
    expect(STORAGE_KEY).toBe('lingua:v1');
  });

  it('round-trips through save and load', () => {
    const storage = new MemoryStorage();
    const p = sampleProgress();
    expect(saveProgress(p, storage)).toBe(true);
    expect(loadProgress(storage, NOW)).toEqual(p);
  });

  it('round-trips through export and import', () => {
    const p = sampleProgress();
    const text = exportProgress(p, NOW);
    expect(JSON.parse(text).app).toBe('lingua');
    expect(importProgress(text, NOW)).toEqual(p);
  });

  it('import rejects files that are not progress exports', () => {
    expect(() => importProgress('not json')).toThrow(/valid JSON/);
    expect(() => importProgress('{"hello": 1}')).toThrow(/doesn't look like/);
  });

  it('corrupted localStorage falls back to a fresh state without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{this is not json');
    const p = loadProgress(storage, NOW);
    expect(p.version).toBe(1);
    expect(p.cards).toEqual({});
    expect(p.goal).toBeNull();

    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, cards: 'x' }));
    expect(loadProgress(storage, NOW).cards).toEqual({});
  });

  it('throwing storage never throws', () => {
    const broken = new BrokenStorage();
    expect(() => loadProgress(broken, NOW)).not.toThrow();
    expect(saveProgress(createFreshProgress(NOW), broken)).toBe(false);
    expect(loadProgress(null, NOW).cards).toEqual({});
  });

  it('sanitises out-of-range settings from imported files', () => {
    const p = sampleProgress();
    const tampered = { ...p, settings: { ...p.settings, desiredRetention: 2, newPerDay: 500 } };
    const loaded = importProgress(JSON.stringify(tampered), NOW);
    expect(loaded.settings.desiredRetention).toBe(0.95);
    expect(loaded.settings.newPerDay).toBe(30);
  });
});
