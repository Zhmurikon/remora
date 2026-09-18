const DEFAULT_SITE_URL = 'http://localhost:3000';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/$/, '');
export const DEFAULT_OG_IMAGE = '/opengraph-image';

export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function jsonLd(value: object): string {
  // Не даём пользовательскому тексту закрыть script-тег в серверном HTML.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
