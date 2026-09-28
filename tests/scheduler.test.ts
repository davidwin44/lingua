import { describe, expect, it } from 'vitest';
import { languages } from '../src/content';
import { buildLexicon } from '../src/content/lexicon';
import { DAY, MINUTE, mulberry32 } from '../src/lib/fsrs';
import { applyReview, createFreshProgress, newCardRecord } from '../src/lib/progress';
import { buildReviewQueue, forecast, nextNewCards, reviewsDoneToday } from '../src/lib/scheduler';
import type { Progress } from '../src/lib/types';

const lexicon = buildLexicon(languages.it);
const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime();

function withReviewCards(p: Progress, count: number, dueAt: number): Progress {
  const cards = { ...p.cards };
  for (let i = 0; i < count; i++) {
    const id = `drill:x${i}`;
    cards[id] = {
      ...newCardRecord(id, dueAt - 30 * DAY),
      state: 'review',
      stability: 10,
      difficulty: 5,
      due: dueAt - i * 1000,
      lastReview: dueAt - 10 * DAY,
      reps: 3,
      introducedAt: dueAt - 30 * DAY,
      graduatedAt: dueAt - 29 * DAY,
    };
  }
  return { ...p, cards };
}

describe('new cards', () => {
  it('are introduced in frequency order and capped per day', () => {
    const p = createFreshProgress(NOON);
    const ids = nextNewCards(p, lexicon, NOON);
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe(`rec:${lexicon[0].id}`);
    expect(ids).toEqual(lexicon.slice(0, 10).map((l) => `rec:${l.id}`));
  });

  it('respects the new-card cap after cards have been studied today', () => {
    let p = createFreshProgress(NOON);
    p = { ...p, settings: { ...p.settings, newPerDay: 5 } };
    for (const id of nextNewCards(p, lexicon, NOON)) p = applyReview(p, id, 3, NOON, { rng: mulberry32(1) });
    expect(nextNewCards(p, lexicon, NOON + MINUTE)).toEqual([]);
    // Tomorrow the cap resets.
    expect(nextNewCards(p, lexicon, NOON + DAY)).toHaveLength(5);
  });

  it('a limit of 0 introduces nothing', () => {
    const p = createFreshProgress(NOON);
    expect(nextNewCards({ ...p, settings: { ...p.settings, newPerDay: 0 } }, lexicon, NOON)).toEqual([]);
  });

  it('production cards unlock only after the recognition card graduates', () => {
    const first = lexicon[0];
    let p = createFreshProgress(NOON);
    p = applyReview(p, `rec:${first.id}`, 3, NOON, { rng: mulberry32(1) }); // learning, 10m step
    expect(p.cards[`rec:${first.id}`].state).toBe('learning');
    expect(nextNewCards(p, lexicon, NOON + DAY)).not.toContain(`prod:${first.id}`);

    p = applyReview(p, `rec:${first.id}`, 3, NOON + 10 * MINUTE, { rng: mulberry32(1) }); // graduates
    expect(p.cards[`rec:${first.id}`].state).toBe('review');
    expect(nextNewCards(p, lexicon, NOON + DAY)).toContain(`prod:${first.id}`);
  });

  it('learner-added cards come first', () => {
    let p = createFreshProgress(NOON);
    const late = lexicon[100];
    p = { ...p, cards: { ...p.cards, [`rec:${late.id}`]: newCardRecord(`rec:${late.id}`, NOON, true) } };
    expect(nextNewCards(p, lexicon, NOON)[0]).toBe(`rec:${late.id}`);
  });
});

describe('review queue and backlog', () => {
  it('caps a review backlog and spreads it across the following days', () => {
    let p = createFreshProgress(NOON);
    p = withReviewCards(p, 400, NOON - 5 * DAY);
    const q = buildReviewQueue(p, NOON, { rng: mulberry32(3) });
    expect(q.ids).toHaveLength(150);
    expect(q.dueTotal).toBe(400);
    expect(q.heldBack).toBe(250);

    const f = forecast(p, NOON);
    expect(f).toHaveLength(7);
    expect(f.map((d) => d.shown).slice(0, 4)).toEqual([150, 150, 100, 0]);
    expect(f[0].due).toBe(400);
  });

  it('counts reviews already done today against the cap', () => {
    let p = createFreshProgress(NOON);
    p = withReviewCards(p, 200, NOON - DAY);
    const q1 = buildReviewQueue(p, NOON, { rng: mulberry32(1) });
    for (const id of q1.ids.slice(0, 50)) p = applyReview(p, id, 3, NOON + 1000, { rng: mulberry32(2) });
    expect(reviewsDoneToday(p, NOON + 2000)).toBe(50);
    expect(buildReviewQueue(p, NOON + 2000).ids).toHaveLength(100);
  });

  it('catch-up mode serves the 20 most overdue cards first', () => {
    let p = createFreshProgress(NOON);
    p = withReviewCards(p, 60, NOON - 10 * DAY);
    const q = buildReviewQueue(p, NOON, { catchUpLimit: 20 });
    expect(q.ids).toHaveLength(20);
    const dues = q.ids.map((id) => p.cards[id].due);
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });

  it('learning cards due now are always included', () => {
    let p = createFreshProgress(NOON);
    p = applyReview(p, `rec:${lexicon[0].id}`, 1, NOON, { rng: mulberry32(1) });
    expect(buildReviewQueue(p, NOON).ids).toEqual([]);
    expect(buildReviewQueue(p, NOON + MINUTE).ids).toEqual([`rec:${lexicon[0].id}`]);
  });
});
