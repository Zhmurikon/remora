import katex from 'katex';
import MarkdownIt from 'markdown-it';
import { markdownMath } from './markdown-math';
import { mediaId } from './article-markdown';
import type { ArticleMedia } from './ArticleContent';
import './card-content.css';
import 'katex/dist/katex.min.css';

const FENCE_MATH = new Set(['math', 'latex', 'tex', 'katex']);

// Этот рендерер намеренно не использует клиентский ArticleContent: исходный Markdown,
// markdown-it и KaTeX остаются на сервере публичной страницы даже для большого курса.
function createRenderer(media: Record<string, ArticleMedia>, headingLevel: 2 | 3) {
  const renderer = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false })
    .use(markdownMath);
  const links: boolean[] = [];

  renderer.renderer.rules.heading_open = (tokens, index) => {
    const token = tokens[index]!;
    const sourceLevel = Number(token.tag.slice(1));
    const level = Math.min(6, headingLevel - 1 + sourceLevel);
    const size = level <= 2 ? 'text-2xl' : level === 3 ? 'text-xl' : 'text-lg';
    return `<h${level} class="${size} pt-3 font-semibold">`;
  };
  renderer.renderer.rules.heading_close = (tokens, index) => {
    const sourceLevel = Number(tokens[index]!.tag.slice(1));
    return `</h${Math.min(6, headingLevel - 1 + sourceLevel)}>`;
  };
  renderer.renderer.rules.paragraph_open = () => '<p class="whitespace-pre-wrap">';
  renderer.renderer.rules.blockquote_open = () =>
    '<blockquote class="border-border text-fg-muted border-l-4 pl-4 italic">';
  renderer.renderer.rules.bullet_list_open = () => '<ul class="list-disc space-y-2 pl-6">';
  renderer.renderer.rules.ordered_list_open = () => '<ol class="list-decimal space-y-2 pl-6">';
  renderer.renderer.rules.hr = () => '<hr class="border-border border-t">';
  renderer.renderer.rules.code_inline = (tokens, index) =>
    `<code class="bg-surface-muted rounded px-1">${escapeHtml(tokens[index]!.content)}</code>`;
  renderer.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index]!;
    const language = token.info.trim().toLowerCase();
    if (FENCE_MATH.has(language)) return renderFormula(token.content.trim(), true);
    return `<pre class="bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4"><code>${escapeHtml(token.content)}</code></pre>`;
  };
  renderer.renderer.rules.math_block = (tokens, index) => renderFormula(tokens[index]!.content.trim(), true);
  renderer.renderer.rules.math_inline = (tokens, index) => renderFormula(tokens[index]!.content, false);
  renderer.renderer.rules.link_open = (tokens, index) => {
    const href = safeHref(tokens[index]!.attrGet('href'));
    links.push(href !== null);
    return href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow" class="text-primary underline">`
      : '<span>';
  };
  renderer.renderer.rules.link_close = () => (links.pop() ? '</a>' : '</span>');
  renderer.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]!;
    const id = mediaId(token.attrGet('src'));
    const asset = id ? media[id] : undefined;
    const alt = token.content.trim();
    if (!asset) return alt ? `<span class="text-fg-muted">${escapeHtml(alt)}</span>` : '';
    const dimensions = [
      asset.width ? ` width="${asset.width}"` : '',
      asset.height ? ` height="${asset.height}"` : '',
    ].join('');
    return `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}" loading="lazy"${dimensions} class="border-border my-2 max-h-[32rem] max-w-full rounded-xl border object-contain">`;
  };
  return renderer;
}

function safeHref(href: string | number | null): string | null {
  const value = href == null ? '' : String(href).trim();
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null;
}

function escapeHtml(value: string): string {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return value.replace(/[&<>"]/g, (character) => entities[character as keyof typeof entities]);
}

function renderFormula(value: string, display: boolean): string {
  const markup = katex.renderToString(value, {
    displayMode: display,
    output: 'htmlAndMathml',
    strict: 'ignore',
    throwOnError: false,
    trust: false,
  });
  return display
    ? `<div class="rm-formula max-w-full overflow-x-auto py-2">${markup}</div>`
    : `<span class="rm-formula-inline">${markup}</span>`;
}

export function ArticleContentServer({
  value,
  headingLevel = 3,
  media = {},
  className = '',
}: {
  value: string;
  headingLevel?: 2 | 3;
  media?: Record<string, ArticleMedia>;
  className?: string;
}) {
  const markup = createRenderer(media, headingLevel).render(value ?? '');
  return (
    <div
      className={`course-article max-w-prose space-y-4 break-words leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
