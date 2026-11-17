'use client';

import { createElement, lazy, Suspense, type ReactNode } from 'react';
import type { Token } from 'markdown-it';
import { md, mediaId } from './article-markdown';
import './article-study.css';
import './card-content.css';

// Подсветка, схемы и формулы загружаются только для материалов с соответствующей разметкой.
const HighlightedCode = lazy(() => import('./HighlightedCode'));
const ArticleDiagram = lazy(() => import('./ArticleDiagram'));
const FormulaContent = lazy(() => import('./FormulaContent'));

const FENCE_MATH = new Set(['math', 'latex', 'tex', 'katex']);

// Подписанные ссылки на изображения теории приходят с сервера картой UUID → ресурс.
export interface ArticleMedia {
  url: string;
  width?: number | null;
  height?: number | null;
}

// В теории нет своего роутинга, поэтому ссылка допустима только абсолютная http(s) или mailto.
function safeHref(href: string | number | null): string | null {
  const value = href == null ? '' : String(href).trim();
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null;
}

function alignClass(token: Token): string {
  const style = String(token.attrGet('style') ?? '');
  if (style.includes('right')) return 'text-right';
  if (style.includes('center')) return 'text-center';
  return '';
}

// В старых уроках вопрос — подзаголовок раздела «Проверь себя», ответ — блоки под ним.
function selfCheckQuestions(tokens: Token[]) {
  const questions: { start: number; answer: number; end: number }[] = [];
  let sectionDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const heading = tokens[i]!;
    if (heading.type !== 'heading_open' || heading.level !== 0) continue;
    const depth = Number(heading.tag.slice(1));
    if (depth <= sectionDepth) sectionDepth = 0;
    if (/^проверь(?:те)?\s+себя[!:.]?$/iu.test(tokens[i + 1]?.content.trim() ?? '')) {
      sectionDepth = depth;
      continue;
    }
    if (!sectionDepth || depth !== sectionDepth + 1) continue;

    const answer = i + 3; // heading_open, inline, heading_close
    let next = answer;
    while (next < tokens.length) {
      const token = tokens[next]!;
      if (token.level === 0 && token.type === 'heading_open' && Number(token.tag.slice(1)) <= depth)
        break;
      next++;
    }
    let end = next;
    while (end > answer && tokens[end - 1]!.type === 'hr') end--;
    if (end > answer) questions.push({ start: i, answer, end });
    i = next - 1;
  }
  return questions;
}

export function ArticleContent({
  value,
  headingLevel = 3,
  articleTitle,
  media = {},
  variant = 'article',
  className = '',
}: {
  value: string;
  headingLevel?: 2 | 3;
  articleTitle?: string;
  media?: Record<string, ArticleMedia>;
  variant?: 'article' | 'card';
  className?: string;
}) {
  const tokens = md.parse(value ?? '', {});
  let headingOffset = headingLevel - 1;
  if (articleTitle !== undefined) {
    // Заголовок урока уже есть над текстом. Точку после номера авторы ставят по-разному.
    const normalize = (text: string) => text.trim().replace(/^(\d+(?:\.\d+)*)\.?(?=\s)/u, '$1');
    if (
      tokens[0]?.type === 'heading_open' &&
      tokens[0].tag === 'h1' &&
      tokens[1]?.type === 'inline' &&
      normalize(tokens[1].content) === normalize(articleTitle)
    )
      tokens.splice(0, 3);
    const levels = tokens
      .filter((t) => t.type === 'heading_open')
      .map((t) => Number(t.tag.slice(1)));
    if (levels.length) headingOffset = headingLevel - Math.min(...levels);
  }
  const summaries = new Set(
    articleTitle === undefined
      ? []
      : tokens.filter(
          (token, index) =>
            token.type === 'blockquote_open' &&
            tokens[index + 1]?.type === 'paragraph_open' &&
            tokens[index + 2]?.content === '**Коротко**',
        ),
  );
  let key = 0;
  const nextKey = () => (key += 1);

  function render(tokens: Token[]): ReactNode[] {
    const root: ReactNode[] = [];
    const stack: { token: Token; children: ReactNode[] }[] = [];
    const push = (node: ReactNode) =>
      (stack.length ? stack[stack.length - 1]!.children : root).push(node);
    for (const token of tokens) {
      if (token.type === 'inline') {
        for (const node of render(token.children ?? [])) push(node);
      } else if (token.nesting === 1) {
        stack.push({ token, children: [] });
      } else if (token.nesting === -1) {
        const top = stack.pop();
        if (top) push(container(top.token, top.children));
      } else {
        push(leaf(token));
      }
    }
    return root;
  }

  function container(open: Token, children: ReactNode[]): ReactNode {
    const k = nextKey();
    switch (open.type) {
      case 'heading_open': {
        const level = Math.min(6, headingOffset + Number(open.tag.slice(1)));
        const size = level <= 2 ? 'text-2xl' : level === 3 ? 'text-xl' : 'text-lg';
        return createElement(
          `h${level}`,
          { key: k, className: `${size} pt-3 font-semibold` },
          children,
        );
      }
      case 'paragraph_open':
        return (
          <p key={k} className="whitespace-pre-wrap">
            {children}
          </p>
        );
      case 'blockquote_open':
        return (
          <blockquote
            key={k}
            className={
              summaries.has(open)
                ? 'article-summary'
                : 'border-border text-fg-muted border-l-4 pl-4 italic'
            }
          >
            {children}
          </blockquote>
        );
      case 'bullet_list_open':
        return (
          <ul key={k} className="list-disc space-y-2 pl-6">
            {children}
          </ul>
        );
      case 'ordered_list_open':
        return (
          <ol key={k} className="list-decimal space-y-2 pl-6">
            {children}
          </ol>
        );
      case 'list_item_open':
        return <li key={k}>{children}</li>;
      case 'table_open':
        return (
          <div key={k} className="max-w-full overflow-x-auto">
            <table className="border-border w-full border-collapse border text-left text-sm">
              {children}
            </table>
          </div>
        );
      case 'thead_open':
        return <thead key={k}>{children}</thead>;
      case 'tbody_open':
        return <tbody key={k}>{children}</tbody>;
      case 'tr_open':
        return <tr key={k}>{children}</tr>;
      case 'th_open':
        return (
          <th
            key={k}
            className={`border-border bg-surface-muted border px-3 py-2 font-semibold ${alignClass(open)}`}
          >
            {children}
          </th>
        );
      case 'td_open':
        return (
          <td key={k} className={`border-border border px-3 py-2 ${alignClass(open)}`}>
            {children}
          </td>
        );
      case 'strong_open':
        return <strong key={k}>{children}</strong>;
      case 'em_open':
        return <em key={k}>{children}</em>;
      case 's_open':
        return <del key={k}>{children}</del>;
      case 'link_open': {
        const href = safeHref(open.attrGet('href'));
        if (!href) return <span key={k}>{children}</span>;
        return (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline"
          >
            {children}
          </a>
        );
      }
      default:
        return <span key={k}>{children}</span>;
    }
  }

  function leaf(token: Token): ReactNode {
    switch (token.type) {
      case 'text':
        return token.content;
      case 'softbreak':
        return variant === 'card' ? <br key={nextKey()} /> : ' ';
      case 'hardbreak':
        return <br key={nextKey()} />;
      case 'hr':
        return <hr key={nextKey()} className="border-border border-t" />;
      case 'code_inline':
        return (
          <code key={nextKey()} className="bg-surface-muted rounded px-1">
            {token.content}
          </code>
        );
      case 'code_block':
        return (
          <pre
            key={nextKey()}
            className="bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4"
          >
            <code>{token.content}</code>
          </pre>
        );
      case 'fence': {
        const info = (token.info || '').trim().toLowerCase();
        if (articleTitle !== undefined && info === 'mermaid') {
          return (
            <Suspense
              key={nextKey()}
              fallback={<pre className="overflow-x-auto">{token.content}</pre>}
            >
              <ArticleDiagram value={token.content} />
            </Suspense>
          );
        }
        if (FENCE_MATH.has(info))
          return (
            <Suspense key={nextKey()} fallback={<p>{token.content}</p>}>
              <FormulaContent value={token.content.trim()} />
            </Suspense>
          );
        return (
          <Suspense
            key={nextKey()}
            fallback={
              <pre className="bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4">
                <code>{token.content}</code>
              </pre>
            }
          >
            <HighlightedCode
              value={token.content.replace(/\n$/, '')}
              language={info || null}
              className=""
            />
          </Suspense>
        );
      }
      case 'math_block':
        return (
          <Suspense key={nextKey()} fallback={<p>{token.content}</p>}>
            <FormulaContent value={token.content.trim()} />
          </Suspense>
        );
      case 'math_inline':
        return (
          <Suspense key={nextKey()} fallback={<span>{token.content}</span>}>
            <FormulaContent value={token.content} display={false} />
          </Suspense>
        );
      case 'image': {
        const alt = token.content?.trim() ?? '';
        const id = mediaId(token.attrGet('src'));
        const asset = id ? media[id] : undefined;
        // Незнакомый media или внешняя ссылка не рендерятся картинкой — максимум подпись.
        if (!asset)
          return alt ? (
            <span key={nextKey()} className="text-fg-muted">
              {alt}
            </span>
          ) : null;
        return (
          <img
            key={nextKey()}
            src={asset.url}
            alt={alt}
            width={asset.width ?? undefined}
            height={asset.height ?? undefined}
            loading="lazy"
            className="border-border my-2 max-h-[32rem] max-w-full rounded-xl border object-contain"
          />
        );
      }
      default:
        return null;
    }
  }

  function renderLesson() {
    const content: ReactNode[] = [];
    let start = 0;
    for (const question of selfCheckQuestions(tokens)) {
      content.push(...render(tokens.slice(start, question.start)));
      content.push(
        <details key={nextKey()} className="rm-study-question">
          <summary>{render(tokens.slice(question.start, question.answer))}</summary>
          {render(tokens.slice(question.answer, question.end))}
        </details>,
      );
      start = question.end;
    }
    return content.concat(render(tokens.slice(start)));
  }

  return (
    <div
      className={`${variant === 'article' ? 'course-article max-w-prose space-y-4' : 'space-y-3'} break-words leading-relaxed ${className}`}
    >
      {articleTitle !== undefined ? renderLesson() : render(tokens)}
    </div>
  );
}
