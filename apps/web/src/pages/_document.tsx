import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Document, { Head, Html, Main, NextScript } from 'next/document';

function readLanding() {
  // У демо и главной один HTML. Якоря остаются привязанными к открытому адресу.
  const html = readFileSync(join(process.cwd(), 'public/lecture-demo/index.html'), 'utf8')
    .replaceAll('="./index.html"', '="/"')
    .replaceAll('="./', '="/lecture-demo/');
  const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
  if (!body) throw new Error('В шаблоне главной отсутствует body');

  return {
    body,
    styles: Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), ([, url]) => url!),
    scripts: Array.from(html.matchAll(/<script src="([^"]+)" defer>/g), ([, url]) => url!),
  };
}

export default class SiteDocument extends Document {
  override render() {
    const landing = this.props.__NEXT_DATA__.page === '/' ? readLanding() : null;
    return (
      <Html lang="ru">
        <Head>
          {landing?.styles.map((href) => (
            <link key={href} rel="stylesheet" href={href} />
          ))}
          {landing?.scripts.map((src) => (
            <script key={src} src={src} defer />
          ))}
        </Head>
        <body>
          {landing && <div dangerouslySetInnerHTML={{ __html: landing.body }} />}
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
