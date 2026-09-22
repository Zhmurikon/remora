'use client';

import { createElement, lazy, Suspense, type ReactNode } from 'react';
import type { Token } from 'markdown-it';
import { md, mediaId } from './article-markdown';
import './card-content.css';

// Тяжёлые зависимости (shiki, katex) грузятся только когда в теории есть код или формула.
const HighlightedCode = lazy(() => import('./HighlightedCode'));
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

export function ArticleContent({
  value,
  headingLevel = 3,
  media = {},
}: {
  value: string;
  headingLevel?: 2 | 3;
  media?: Record<string, ArticleMedia>;
}) {
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
        const level = Math.min(6, headingLevel - 1 + Number(open.tag.slice(1)));
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
          <blockquote key={k} className="border-border text-fg-muted border-l-4 pl-4 italic">
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
        return ' ';
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

  return (
    <div className="course-article max-w-prose space-y-4 break-words leading-relaxed">
      {render(md.parse(value ?? '', {}))}
    </div>
  );
}
