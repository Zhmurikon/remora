import { useId, useState, type ReactNode } from 'react';

const SHORT_DESCRIPTION = 240;

function preview(text: string) {
  const characters = Array.from(text);
  if (characters.length <= SHORT_DESCRIPTION) return text;
  const opening = characters.slice(0, SHORT_DESCRIPTION - 1).join('');
  const sentence = opening.match(/^.*?[.!?…][»”"]?(?=\s)|^[^\n]+(?=\n)/su);
  if (sentence) return sentence[0];
  const boundary = opening.search(/\s+\S*$/u);
  return (boundary > 0 ? opening.slice(0, boundary) : opening) + '…';
}

function paragraphs(text: string, opening: string) {
  // Авторские переносы сохраняем. Сплошной длинный текст делим по границам предложений.
  if (text.includes('\n') || text === opening) return text.split(/\n\s*\n/u);
  const parts: string[] = [];
  let rest = text;
  if (text.startsWith(opening)) {
    parts.push(opening);
    rest = text.slice(opening.length).trimStart();
  }
  let paragraph = '';
  for (const sentence of rest.split(/(?<=[.!?…])\s+(?=\p{Lu})/u)) {
    if (paragraph && paragraph.length + sentence.length > 290) {
      parts.push(paragraph);
      paragraph = '';
    }
    paragraph += (paragraph ? ' ' : '') + sentence;
  }
  if (paragraph) parts.push(paragraph);
  return parts;
}

export function MaterialDescription({
  description,
  children,
}: {
  description: string;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const text = description.trim();
  if (!text && !children) return null;
  const opening = preview(text);
  return (
    <div className="material-description">
      {text && (
        <div id={id} className="material-description-text">
          {(expanded ? paragraphs(text, opening) : [opening]).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}
      {(children || opening !== text) && (
        <div className="material-description-footer">
          {opening !== text && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Свернуть описание' : 'Полное описание'}
              <span aria-hidden="true" className="material-caret" />
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
