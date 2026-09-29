import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../src/state/AppContext';
import { App } from '../src/App';
import { languages, languageList } from '../src/content';
import { buildSystemPrompt } from '../src/lib/claude';
import { explainMismatch } from '../src/lib/speech';
import { createFreshProgress } from '../src/lib/progress';
import {
  ACTIVE_KEY,
  STORAGE_KEY,
  activeLanguage,
  hasProgress,
  loadProgress,
  progressKey,
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

const NOW = new Date(2026, 4, 1, 10).getTime();

describe('language packs', () => {
  it('registers Italian as the full course, then French and Spanish as previews', () => {
    expect(languageList.map((p) => [p.meta.code, p.meta.status])).toEqual([
      ['it', 'full'],
      ['fr', 'preview'],
      ['es', 'preview'],
    ]);
  });

  it('gives every pack its own greetings, registers and compound past', () => {
    expect(languages.fr.meta.registers.formal.label).toBe('vous');
    expect(languages.es.meta.registers.formal.label).toBe('usted');
    expect(languages.es.meta.auxiliaries).toEqual(['haber']);
    expect(languages.fr.meta.pastTense).toBe('passé composé');
  });
});

describe('progress per language', () => {
  it('keeps Italian at the original key, so older progress needs no migration', () => {
    expect(progressKey('it')).toBe(STORAGE_KEY);
    expect(progressKey('fr')).toBe(`${STORAGE_KEY}:fr`);
  });

  it('saves each language separately and remembers the one last used', () => {
    const storage = new MemoryStorage();
    const it = { ...createFreshProgress(NOW, 'it'), goal: { reason: 'travel' as const, unit: 'minutes' as const, target: 60 } };
    const fr = { ...createFreshProgress(NOW, 'fr'), goal: { reason: 'work' as const, unit: 'sessions' as const, target: 3 } };
    saveProgress(it, storage);
    saveProgress(fr, storage);

    expect(activeLanguage(storage)).toBe('fr');
    expect(storage.getItem(ACTIVE_KEY)).toBe('fr');
    expect(loadProgress(storage, NOW).goal?.reason).toBe('work');
    expect(loadProgress(storage, NOW, 'it').goal?.reason).toBe('travel');
    expect(hasProgress('es', storage)).toBe(false);
    expect(loadProgress(storage, NOW, 'es').lang).toBe('es');
  });

  it('reads progress saved before languages existed as Italian', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(createFreshProgress(NOW)));
    expect(activeLanguage(storage)).toBe('it');
    expect(loadProgress(storage, NOW).lang).toBe('it');
  });
});

describe('language-aware tutor and pronunciation', () => {
  it('builds the tutor prompt from the pack: French, with vous as the formal register', () => {
    const scenario = languages.fr.scenarios.find((s) => s.register === 'formal')!;
    const prompt = buildSystemPrompt(scenario, languages.fr.meta);
    expect(prompt).toContain('patient French conversation partner');
    expect(prompt).toContain('address the learner with vous');
    expect(prompt).toContain('register (tu/vous)');
    expect(prompt).not.toMatch(/Italian|Lei/);
  });

  it('keeps Italian-only pronunciation rules out of other languages', () => {
    expect(explainMismatch('palla', 'pala', 'it')).toMatch(/double/);
    expect(explainMismatch('perro', 'pero', 'es')).toBe('heard “pero”, expected “perro”');
    expect(explainMismatch('café', 'cafe', 'fr')).toBe('heard “cafe”, expected “café”: check the accented vowel');
    expect(explainMismatch('café', 'cafe', 'es')).toMatch(/stress the final vowel/);
  });
});

describe('language dropdown', () => {
  it('opens with the keyboard, shows every language, and closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider storage={new MemoryStorage()}>
        <MemoryRouter initialEntries={['/welcome']}>
          <App />
        </MemoryRouter>
      </AppProvider>,
    );
    const combo = screen.getByRole('combobox', { name: /Language/ });
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    combo.focus();
    await user.keyboard('{ArrowDown}');
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Italian'),
      expect.stringContaining('French'),
      expect.stringContaining('Spanish'),
    ]);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(combo).toHaveAttribute('aria-activedescendant', options[2].id);
    await user.keyboard('{Escape}');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(combo).toHaveTextContent('Italian');
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(screen.getByRole('combobox', { name: /Language/ })).toHaveTextContent('Spanish');
  });
});

describe('switching language', () => {
  it('opens French from Settings with its own onboarding, and Italian progress is still there after', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const it = { ...createFreshProgress(Date.now(), 'it'), goal: { reason: 'travel' as const, unit: 'minutes' as const, target: 60 } };
    saveProgress(it, storage);
    render(
      <AppProvider storage={storage}>
        <MemoryRouter initialEntries={['/settings']}>
          <App />
        </MemoryRouter>
      </AppProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: /Language/ }));
    await user.click(screen.getByRole('option', { name: /French/ }));
    // A language with no progress starts at onboarding, with French selected.
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Language/ })).toHaveTextContent('French');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Why are you learning French?' })).toBeInTheDocument();

    // Back to Italian: its goal was never touched, so Home opens straight away.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('combobox', { name: /Language/ }));
    await user.click(screen.getByRole('option', { name: /Italian/ }));
    expect(await screen.findByText(/Goal: travel/)).toBeInTheDocument();
    expect(loadProgress(storage, Date.now(), 'it').goal?.reason).toBe('travel');
  });
});
