/**
 * Tokenising target-language text for tap-to-gloss and coverage.
 * Elided forms keep their apostrophe as part of the token: "l'amico" → ["l'", "amico"],
 * "un po'" → ["un", "po'"], "c'è" → ["c'", "è"].
 */

export interface TextPiece {
  text: string;
  /** Lowercased gloss key for word tokens; null for spaces/punctuation. */
  key: string | null;
}

const TOKEN_RE = /[\p{L}\p{N}]+['’]?/gu;

export function tokenKey(surface: string): string {
  return surface.toLowerCase().replace(/’/g, "'");
}

/** Split text into word tokens and the text between them (so it can be rendered faithfully). */
export function segment(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) pieces.push({ text: text.slice(last, start), key: null });
    pieces.push({ text: m[0], key: tokenKey(m[0]) });
    last = start + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), key: null });
  return pieces;
}

export function tokenize(text: string): string[] {
  return segment(text)
    .map((p) => p.key)
    .filter((k): k is string => k !== null);
}

export type WordGroup = { space: true; text: string } | { space: false; pieces: TextPiece[] };

/**
 * Group a word with the punctuation touching it ("«Buongiorno!»") so a line never breaks
 * between them. Groups are separated by the original whitespace.
 */
export function wordGroups(text: string): WordGroup[] {
  const out: WordGroup[] = [];
  let current: TextPiece[] = [];
  const close = () => {
    if (current.length > 0) out.push({ space: false, pieces: current });
    current = [];
  };
  for (const piece of segment(text)) {
    if (piece.key) {
      current.push(piece);
      continue;
    }
    for (const part of piece.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        close();
        out.push({ space: true, text: part });
      } else current.push({ text: part, key: null });
    }
  }
  close();
  return out;
}
