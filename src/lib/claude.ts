/**
 * Optional Claude tutor: structured role-play with explicit, prompt-first corrective feedback.
 *
 * Principle 9: output with explicit feedback is the weakest area in current apps. LLM tutors
 * help most as structured feedback generators (g = 1.71 for feedback tools vs "moderate" for
 * conversation partners), so scenarios have a goal and a register, and every learner turn
 * gets at most 2 targeted corrections, shown as a prompt first (self-correction) and only
 * then revealed.
 *
 * The API key lives only in this browser's localStorage and is sent only to api.anthropic.com.
 */
import type { LangMeta, Scenario } from '../content/types';

export const DEFAULT_MODEL = 'claude-opus-5';
export const API_URL = 'https://api.anthropic.com/v1/messages';

export type TutorErrorType = 'grammar' | 'vocab' | 'register' | 'spelling';

export interface TutorCorrection {
  span: string;
  type: TutorErrorType;
  prompt: string;
  correction: string;
  explanation: string;
}

export interface TutorTurn {
  reply: string;
  reply_en: string;
  errors: TutorCorrection[];
  /** True when the model didn't return JSON and we fell back to plain text. */
  plainText?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(scenario: Scenario, meta: LangMeta): string {
  const languageName = meta.name;
  const { informal, formal } = meta.registers;
  const registerRule =
    scenario.register === 'formal'
      ? `This situation is FORMAL: you address the learner with ${formal.label}, and they should address you with ${formal.label} (${formal.forms}). If they use ${informal.label} forms with you, that is a register error.`
      : `This situation is INFORMAL: you and the learner use ${informal.label} with each other (${informal.forms}). If they use ${formal.label} forms with you, that is a register error.`;
  return [
    `You are a patient ${languageName} conversation partner for an adult learner at CEFR level ${scenario.level} (A1/A2).`,
    `Role-play scenario: "${scenario.title}". You play: ${scenario.role}`,
    `The learner's goal: ${scenario.goal}`,
    scenario.focus ? `Language focus: ${scenario.focus}.` : '',
    registerRule,
    '',
    'Rules:',
    `- Stay in character and in ${languageName}. Keep every reply to 1-3 short, simple sentences at the learner's level, using high-frequency words.`,
    '- Move the scenario forward and help the learner reach their goal; ask one simple question at a time.',
    `- After every learner turn, identify at most 2 errors. Prioritise errors that hurt comprehension and register (${informal.label}/${formal.label}) over small slips. Ignore missing capitals and punctuation. If there are no real errors, return an empty list.`,
    `- For each error give a short metalinguistic "prompt" that helps the learner self-correct WITHOUT giving the answer (e.g. "${meta.tutorPromptExample}"), then the "correction" (the corrected phrase) and a one-sentence English "explanation".`,
    `- If the learner writes in English, reply in simple ${languageName} and gently encourage them to try in ${languageName}.`,
    '',
    'Respond with ONLY a JSON object, no other text, in exactly this shape:',
    `{"reply": string (your in-character ${languageName} reply), "reply_en": string (English translation of your reply), "errors": [{"span": string (the learner's erroneous words, copied exactly), "type": "grammar" | "vocab" | "register" | "spelling", "prompt": string, "correction": string, "explanation": string}]}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** Extract the first balanced top-level JSON object from arbitrary text (respecting strings). */
export function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
    start = text.indexOf('{', start + 1);
  }
  return null;
}

const ERROR_TYPES: TutorErrorType[] = ['grammar', 'vocab', 'register', 'spelling'];

/** Parse a tutor reply robustly: first JSON object if present, otherwise plain text. */
export function parseTutorResponse(text: string): TutorTurn {
  const json = extractFirstJsonObject(text);
  if (json) {
    try {
      const raw = JSON.parse(json) as Record<string, unknown>;
      if (typeof raw.reply === 'string') {
        const errors = Array.isArray(raw.errors) ? raw.errors : [];
        return {
          reply: raw.reply.trim(),
          reply_en: typeof raw.reply_en === 'string' ? raw.reply_en.trim() : '',
          errors: errors
            .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
            .map((e) => ({
              span: String(e.span ?? ''),
              type: ERROR_TYPES.includes(e.type as TutorErrorType) ? (e.type as TutorErrorType) : 'grammar',
              prompt: String(e.prompt ?? 'Look at this part again. Can you fix it?'),
              correction: String(e.correction ?? ''),
              explanation: String(e.explanation ?? ''),
            }))
            .filter((e) => e.correction)
            .slice(0, 2),
        };
      }
    } catch {
      /* fall through to plain text */
    }
  }
  return { reply: text.trim(), reply_en: '', errors: [], plainText: true };
}

export type TutorFailure = 'no-key' | 'auth' | 'rate' | 'overloaded' | 'network' | 'bad-request' | 'refusal' | 'other';

export class TutorApiError extends Error {
  constructor(
    public kind: TutorFailure,
    message: string,
  ) {
    super(message);
    this.name = 'TutorApiError';
  }
}

export function friendlyStatusMessage(status: number, apiMessage?: string): TutorApiError {
  if (status === 401 || status === 403) {
    return new TutorApiError('auth', 'The API key was rejected. Check the key in Settings (it should start with “sk-ant-”).');
  }
  if (status === 429) return new TutorApiError('rate', 'Too many requests right now. Wait a minute and try again.');
  if (status === 529 || status === 503) return new TutorApiError('overloaded', 'The tutor is busy at the moment. Try again shortly.');
  if (status === 400 || status === 404) {
    return new TutorApiError(
      'bad-request',
      `The request was refused${apiMessage ? `: ${apiMessage}` : ''}. Check the model ID in Settings.`,
    );
  }
  return new TutorApiError('other', `The tutor returned an error (${status}). Try again.`);
}

export interface CallTutorOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Call the Anthropic Messages API directly from the browser. */
export async function callTutor(opts: CallTutorOptions): Promise<TutorTurn> {
  if (!opts.apiKey.trim()) throw new TutorApiError('no-key', 'Add an API key in Settings to use the tutor.');
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': opts.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model.trim() || DEFAULT_MODEL,
        max_tokens: 4096,
        system: opts.system,
        messages: opts.messages,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new TutorApiError('network', 'Couldn’t reach api.anthropic.com. Check your internet connection and try again.');
  }
  if (!res.ok) {
    let apiMessage: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      apiMessage = body.error?.message;
    } catch {
      /* ignore */
    }
    throw friendlyStatusMessage(res.status, apiMessage);
  }
  let body: { content?: { type: string; text?: string }[]; stop_reason?: string };
  try {
    body = await res.json();
  } catch {
    throw new TutorApiError('other', 'The tutor sent a reply that couldn’t be read. Try again.');
  }
  if (body.stop_reason === 'refusal') {
    throw new TutorApiError('refusal', 'The tutor couldn’t answer that. Try rephrasing.');
  }
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
  if (!text.trim()) throw new TutorApiError('other', 'The tutor sent an empty reply. Try again.');
  return parseTutorResponse(text);
}
