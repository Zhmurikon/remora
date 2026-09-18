import type { ReactNode } from 'react';

function inline(value: string): ReactNode {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith('**') ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') ? (
      <code key={index} className="bg-surface-muted rounded px-1">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

/** Ограниченная разметка без HTML, внешних изображений и исполняемых ссылок. */
export function ArticleContent({
  value,
  headingLevel = 3,
}: {
  value: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const blocks: ReactNode[] = [];
  const lines = value.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i]?.startsWith('```')) code.push(lines[i] ?? '');
      blocks.push(
        <pre key={i} className="bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4">
          <code>{code.join('\n')}</code>
        </pre>,
      );
    } else if (/^#{1,3} /.test(line)) {
      blocks.push(
        <Heading key={i} className="pt-3 text-xl font-semibold">
          {inline(line.replace(/^#{1,3} /, ''))}
        </Heading>,
      );
    } else if (/^[-*] /.test(line)) {
      const items = [line.slice(2)];
      while (i + 1 < lines.length && /^[-*] /.test(lines[i + 1] ?? ''))
        items.push((lines[++i] ?? '').slice(2));
      blocks.push(
        <ul key={i} className="list-disc space-y-2 pl-6">
          {items.map((text, n) => (
            <li key={n}>{inline(text)}</li>
          ))}
        </ul>,
      );
    } else if (line.trim()) {
      const paragraph = [line];
      while (
        i + 1 < lines.length &&
        lines[i + 1]?.trim() &&
        !/^(#{1,3} |[-*] |```)/.test(lines[i + 1] ?? '')
      )
        paragraph.push(lines[++i] ?? '');
      blocks.push(
        <p key={i} className="whitespace-pre-wrap">
          {inline(paragraph.join('\n'))}
        </p>,
      );
    }
  }
  return <div className="max-w-prose space-y-4 break-words leading-relaxed">{blocks}</div>;
}
