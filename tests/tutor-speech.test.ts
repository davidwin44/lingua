import { describe, expect, it, vi } from 'vitest';
import { TutorApiError, callTutor, extractFirstJsonObject, parseTutorResponse } from '../src/lib/claude';
import { explainMismatch, scorePronunciation, verdictFor } from '../src/lib/speech';

describe('tutor response parsing', () => {
  it('extracts the first JSON object from surrounding text', () => {
    const text = 'Sure! {"reply": "Ciao {amico}!", "reply_en": "Hi", "errors": []} trailing {"x":1}';
    expect(JSON.parse(extractFirstJsonObject(text)!).reply).toBe('Ciao {amico}!');
  });

  it('parses corrections and caps them at 2', () => {
    const json = JSON.stringify({
      reply: 'Perfetto!',
      reply_en: 'Perfect!',
      errors: [
        { span: 'ho andato', type: 'grammar', prompt: 'Motion verb?', correction: 'sono andato', explanation: 'Andare takes essere.' },
        { span: 'puoi', type: 'register', prompt: 'Tu or Lei?', correction: 'può', explanation: 'Use Lei.' },
        { span: 'x', type: 'weird', prompt: 'p', correction: 'y', explanation: 'z' },
      ],
    });
    const turn = parseTutorResponse('```json\n' + json + '\n```');
    expect(turn.reply).toBe('Perfetto!');
    expect(turn.errors).toHaveLength(2);
    expect(turn.errors[1].type).toBe('register');
  });

  it('falls back to plain text', () => {
    const turn = parseTutorResponse('Ciao! Come stai?');
    expect(turn).toMatchObject({ reply: 'Ciao! Come stai?', errors: [], plainText: true });
  });

  it('sends the required headers and maps 401/429/network errors to friendly messages', async () => {
    const ok = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{"reply":"Ciao","reply_en":"Hi","errors":[]}' }], stop_reason: 'end_turn' }), {
        status: 200,
      }),
    );
    const turn = await callTutor({ apiKey: 'sk-test', model: 'm', system: 's', messages: [{ role: 'user', content: 'ciao' }], fetchImpl: ok as unknown as typeof fetch });
    expect(turn.reply).toBe('Ciao');
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const status = (code: number) => vi.fn(async () => new Response('{}', { status: code })) as unknown as typeof fetch;
    const base = { apiKey: 'k', model: 'm', system: 's', messages: [] };
    await expect(callTutor({ ...base, fetchImpl: status(401) })).rejects.toMatchObject({ kind: 'auth' });
    await expect(callTutor({ ...base, fetchImpl: status(429) })).rejects.toMatchObject({ kind: 'rate' });
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(callTutor({ ...base, fetchImpl: offline })).rejects.toMatchObject({ kind: 'network' });
    await expect(callTutor({ ...base, apiKey: ' ' })).rejects.toBeInstanceOf(TutorApiError);
  });
});

describe('pronunciation scoring', () => {
  it('uses lenient thresholds', () => {
    expect(verdictFor(0.8)).toBe('clear');
    expect(verdictFor(0.65)).toBe('close');
    expect(verdictFor(0.3)).toBe('missed');
  });

  it('picks the best alternative and highlights words', () => {
    const r = scorePronunciation('la palla è rossa', ['la pala è rossa', 'la palla è rossa']);
    expect(r.score).toBe(1);
    expect(r.words.every((w) => w.match)).toBe(true);
    const r2 = scorePronunciation('la palla è rossa', ['la pala è rossa']);
    expect(r2.words.find((w) => !w.match)).toMatchObject({ expected: 'palla', heard: 'pala' });
    expect(r2.feedback[0]).toMatch(/double “ll”/);
  });

  it('gives explicit accent feedback', () => {
    expect(explainMismatch('però', 'pero')).toBe('heard “pero”, expected “però”: stress the final vowel');
  });
});
