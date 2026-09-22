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
