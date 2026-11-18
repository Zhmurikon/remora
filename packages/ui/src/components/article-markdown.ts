import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { markdownMath } from './markdown-math';

// Единый парсер теории: html:false запрещает сырой HTML (XSS), формулы добавляет markdownMath.
export const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
}).use(markdownMath);

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Изображение теории адресуется только протоколом media: с валидным UUID.
// Внешние ссылки (http, data) намеренно отвергаются — иначе утечка IP зрителя и битые ссылки.
export function mediaId(src: string | number | null): string | null {
  const value = src == null ? '' : String(src).trim();
  if (!/^media:/i.test(value)) return null;
  const id = value.slice(value.indexOf(':') + 1).toLowerCase();
  return UUID.test(id) ? id : null;
}

// UUID изображений в порядке появления, без повторов. Это реальный клиентский разбор markdown:
// сервер обязан извлекать ровно тот же набор, чтобы карта подписанных ссылок совпала.
export function articleMediaIds(value: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (tokens: Token[]): void => {
    for (const token of tokens) {
      if (token.type === 'image') {
        const id = mediaId(token.attrGet('src'));
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      if (token.children) walk(token.children);
    }
  };
  walk(md.parse(value ?? '', {}));
  return ids;
}

export function prepareArticleHeadings(
  tokens: Token[],
  headingLevel: 2 | 3,
  articleTitle?: string,
) {
  let headingOffset = headingLevel - 1;
  if (articleTitle !== undefined) {
    // Заголовок уже есть над текстом. В Markdown авторы иногда опускают номер урока или точку.
    const normalize = (text: string) => text.trim().replace(/^(\d+(?:\.\d+)*)\.?(?=\s)/u, '$1');
    const title = normalize(articleTitle);
    if (
      tokens[0]?.type === 'heading_open' &&
      tokens[0].tag === 'h1' &&
      tokens[1]?.type === 'inline' &&
      (normalize(tokens[1].content) === title ||
        tokens[1].content.trim() === title.replace(/^\d+(?:\.\d+)*\s+/u, ''))
    )
      tokens.splice(0, 3);
    const levels = tokens
      .filter((t) => t.type === 'heading_open')
      .map((t) => Number(t.tag.slice(1)));
    if (levels.length) headingOffset = headingLevel - Math.min(...levels);
  }
  return headingOffset;
}

export function isArticleSummary(tokens: Token[], index: number) {
  return (
    tokens[index]?.type === 'blockquote_open' &&
    tokens[index + 1]?.type === 'paragraph_open' &&
    tokens[index + 2]?.content === '**Коротко**'
  );
}
