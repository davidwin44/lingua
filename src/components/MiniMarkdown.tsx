import type { ReactNode } from 'react';

/** Inline **bold** and *italic*. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}-${i++}`}>{m[1]}</strong>);
    else out.push(<em key={`${keyBase}-${i++}`}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Markdown-lite for lesson explanations: paragraphs, "- " bullet lists, **bold**, *italic*. */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="prose">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const bullets = lines.filter((l) => l.trim().startsWith('- '));
        const intro = lines.filter((l) => !l.trim().startsWith('- ')).join(' ');
        return (
          <div key={bi}>
            {intro.trim() ? <p>{inline(intro, `p${bi}`)}</p> : null}
            {bullets.length > 0 ? (
              <ul>
                {bullets.map((b, li) => (
                  <li key={li}>{inline(b.trim().slice(2), `b${bi}-${li}`)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
