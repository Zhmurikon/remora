import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Навигация и реквизиты берутся из того же шаблона, что и на главной.
export function readLandingChrome() {
  const template = readFileSync(join(process.cwd(), 'public/lecture-demo/index.html'), 'utf8')
    .replaceAll('href="./index.html"', 'href="/"')
    .replaceAll('="./', '="/lecture-demo/')
    .replaceAll('href="#', 'href="/#');
  const header = template.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
  const footer = template.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
  if (!header || !footer) throw new Error('В шаблоне главной отсутствует навигация или подвал');
  return { header, footer };
}
