import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../src/state/AppContext';
import { App } from '../src/App';
import { PromptedDrill } from '../src/components/PromptedDrill';
import { STORAGE_KEY, type KVStorage } from '../src/lib/storage';
import { createFreshProgress } from '../src/lib/progress';
import type { Progress } from '../src/lib/types';

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

function renderDrill(onComplete = vi.fn()) {
  render(
    <AppProvider storage={null}>
      <PromptedDrill
        prompt="Ieri Marco ___ a Roma. (andare)"
        accepted={['è andato']}
        hints={['Is andare a verb of motion? Which auxiliary do motion verbs take?', 'Motion verbs take essere: è andat…']}
        explanation="Andare is a motion verb, so it takes essere."
        lang="it-IT"
        onComplete={onComplete}
      />
    </AppProvider>,
  );
  return onComplete;
}

async function attempt(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByLabelText('Your answer');
  await user.clear(input);
  await user.type(input, `${text}{Enter}`);
}

describe('PromptedDrill: prompt-then-reveal feedback', () => {
  it('requires two wrong attempts with prompts before revealing the answer', async () => {
    const user = userEvent.setup();
    const onComplete = renderDrill();

    await attempt(user, 'ha andato');
    expect(screen.getByText(/Which auxiliary do motion verbs take/)).toBeInTheDocument();
    expect(screen.queryByTestId('revealed-answer')).toBeNull();
    expect(screen.queryByText('è andato')).toBeNull();

    await attempt(user, 'è andata');
    expect(screen.getByText(/Motion verbs take essere/)).toBeInTheDocument();
    expect(screen.queryByTestId('revealed-answer')).toBeNull();

    await attempt(user, 'va');
    expect(screen.getByTestId('revealed-answer')).toHaveTextContent('è andato');
    expect(screen.getByText(/takes essere/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onComplete).toHaveBeenCalledWith({ grade: 1, solved: false, wrongAttempts: 3 });
  });

  it('grades Hard when right after a prompt', async () => {
    const user = userEvent.setup();
    const afterPrompt = renderDrill();
    await attempt(user, 'ha andato');
    await attempt(user, 'è andato');
    expect(screen.getByText('Correct after a hint')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(afterPrompt).toHaveBeenCalledWith({ grade: 2, solved: true, wrongAttempts: 1 });
  });

  it('grades Good when right first time', async () => {
    const user = userEvent.setup();
    const onComplete = renderDrill();
    await attempt(user, 'È andato');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onComplete).toHaveBeenCalledWith({ grade: 3, solved: true, wrongAttempts: 0 });
  });

  it('flags accent-only slips in the prompt', async () => {
    const user = userEvent.setup();
    renderDrill();
    await attempt(user, 'e andato');
    expect(screen.getByText(/check the accents/i)).toBeInTheDocument();
    expect(screen.queryByTestId('revealed-answer')).toBeNull();
  });
});

describe('App flow', () => {
  it('onboards, then learns a new word with typed recall and schedules it on a learning step', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(
      <AppProvider storage={storage}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AppProvider>,
    );

    // Onboarding: language → goal → weekly target → start. Italian is already chosen.
    expect(screen.getByRole('combobox', { name: /Language/ })).toHaveTextContent('Italian');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Travel/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Start learning' }));

    // Dashboard: goal, weekly ring, forecast; no streak language anywhere.
    expect(screen.getByText(/Goal: travel/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next 7 days' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/streak/i);

    await user.click(screen.getByRole('link', { name: /Learn 10 new words/ }));

    // Three new words are introduced before the first is tested.
    for (let i = 0; i < 3; i++) {
      expect(screen.getByText('New word')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
    }

    // Typed recall of the first word ("di" → "of").
    expect(screen.getByText('di')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Type the English meaning'), 'of{Enter}');
    const feedback = screen.getByRole('status');
    expect(within(feedback).getByText('Correct')).toBeInTheDocument();
    // Keyboard grading: 1-4 choose a grade (3 = Good) right after the reveal.
    await user.keyboard('3');

    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!) as Progress;
    const card = saved.cards['rec:w-di'];
    expect(card.state).toBe('learning');
    expect(card.due - card.lastReview!).toBe(10 * 60_000);
    expect(saved.reviewLog).toHaveLength(1);
  });

  it('shows a warm welcome-back with a capped catch-up after an absence', () => {
    const now = Date.now();
    const base = createFreshProgress(now - 30 * 86_400_000);
    const p: Progress = {
      ...base,
      goal: { reason: 'fun', unit: 'sessions', target: 3 },
      lastActivityAt: now - 10 * 86_400_000,
      reviewLog: [{ cardId: 'rec:w-di', timestamp: now - 10 * 86_400_000, grade: 3, elapsedDays: 0, stateBefore: 'new', S: 2.3, D: 2.1, R: null }],
    };
    render(
      <AppProvider storage={null} initialProgress={p}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AppProvider>,
    );
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /20-card catch-up/ })).toHaveAttribute('href', '/review?mode=catchup');
    expect(document.body.textContent).not.toMatch(/streak|lost|missed/i);
  });
});
